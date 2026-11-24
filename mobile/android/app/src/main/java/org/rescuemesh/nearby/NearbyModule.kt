package org.rescuemesh.nearby

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap

/**
 * Real device-to-device transport for RescueMesh, built on Google Nearby
 * Connections.
 *
 * Why Nearby Connections instead of raw BLE / Wi-Fi Direct:
 *  - Raw BLE GATT needs a custom peripheral (advertiser + GATT server) and
 *    manual MTU fragmentation; Wi-Fi Direct needs group-owner negotiation and
 *    socket management, and behaves differently across vendors.
 *  - Nearby Connections does discovery over BLE, then upgrades the link to
 *    Bluetooth Classic or Wi-Fi automatically, with no internet required.
 *
 * Topology: Strategy.P2P_CLUSTER (M-to-N), so every phone advertises and
 * discovers at the same time and can hold several connections. Multi-hop
 * forwarding is NOT done here: this layer only moves bytes between direct
 * neighbours. Store-and-forward, dedupe and hop limits live in the TypeScript
 * MeshEngine.
 *
 * Every event is sent to JS as "RescueMeshNearbyEvent" with a `type` field
 * matching TransportEvent in src/mesh/core/transport.ts.
 */
class NearbyModule(reactContext: ReactApplicationContext) : NativeRescueMeshNearbySpec(reactContext) {

  companion object {
    const val NAME = "RescueMeshNearby"
    const val EVENT = "RescueMeshNearbyEvent"
    private const val TAG = "RescueMeshNearby"
  }

  private val client: ConnectionsClient by lazy { Nearby.getConnectionsClient(reactApplicationContext) }
  private var endpointName: String = ""
  private var myDeviceId: String = ""
  private var running = false
  /** endpointId -> remote endpoint name ("deviceId|name") */
  private val names = ConcurrentHashMap<String, String>()
  private val connected = ConcurrentHashMap.newKeySet<String>()
  private val pending = ConcurrentHashMap.newKeySet<String>()

  override fun getName(): String = NAME

  // ---------------------------------------------------------------- JS API

  override fun isAvailable(promise: Promise) {
    val code = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(reactApplicationContext)
    promise.resolve(code == ConnectionResult.SUCCESS)
  }

  override fun start(endpointName: String, serviceId: String, promise: Promise) {
    if (running) {
      promise.resolve(null)
      return
    }
    this.endpointName = endpointName
    this.myDeviceId = endpointName.substringBefore('|')
    val strategy = Strategy.P2P_CLUSTER
    emitState("STARTING", null)
    client.startAdvertising(endpointName, serviceId, lifecycle, AdvertisingOptions.Builder().setStrategy(strategy).build())
      .addOnSuccessListener {
        client.startDiscovery(serviceId, discovery, DiscoveryOptions.Builder().setStrategy(strategy).build())
          .addOnSuccessListener {
            running = true
            emitState("RUNNING", "Advertising and discovering")
            promise.resolve(null)
          }
          .addOnFailureListener { e ->
            client.stopAdvertising()
            emitState("ERROR", "Discovery failed: ${e.message}")
            promise.reject("DISCOVERY_FAILED", e.message, e)
          }
      }
      .addOnFailureListener { e ->
        emitState("ERROR", "Advertising failed: ${e.message}")
        promise.reject("ADVERTISING_FAILED", e.message, e)
      }
  }

  override fun stop(promise: Promise) {
    client.stopAdvertising()
    client.stopDiscovery()
    client.stopAllEndpoints()
    for (id in connected) emit("disconnected", id)
    connected.clear()
    pending.clear()
    names.clear()
    running = false
    emitState("STOPPED", null)
    promise.resolve(null)
  }

  override fun send(endpointId: String, data: String, promise: Promise) {
    if (!connected.contains(endpointId)) {
      promise.reject("NOT_CONNECTED", "Endpoint $endpointId is not connected")
      return
    }
    val bytes = data.toByteArray(StandardCharsets.UTF_8)
    if (bytes.size > ConnectionsClient.MAX_BYTES_DATA_SIZE) {
      promise.reject("TOO_LARGE", "Payload ${bytes.size} bytes exceeds Nearby BYTES limit")
      return
    }
    client.sendPayload(endpointId, Payload.fromBytes(bytes))
      .addOnSuccessListener { promise.resolve(null) }
      .addOnFailureListener { e -> promise.reject("SEND_FAILED", e.message, e) }
  }

  override fun addListener(eventName: String) { /* required by NativeEventEmitter */ }

  override fun removeListeners(count: Double) { /* required by NativeEventEmitter */ }

  // ---------------------------------------------------------------- Nearby callbacks

  private val discovery = object : EndpointDiscoveryCallback() {
    override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
      names[endpointId] = info.endpointName
      emit("peerFound", endpointId, info.endpointName)
      val theirId = info.endpointName.substringBefore('|')
      // Both phones discover each other. To avoid simultaneous duplicate
      // connection requests, only the phone with the smaller deviceId asks.
      if (myDeviceId < theirId && !connected.contains(endpointId) && pending.add(endpointId)) {
        requestConnection(endpointId)
      }
    }

    override fun onEndpointLost(endpointId: String) {
      if (!connected.contains(endpointId)) names.remove(endpointId)
      emit("peerLost", endpointId)
    }
  }

  private fun requestConnection(endpointId: String) {
    client.requestConnection(endpointName, endpointId, lifecycle)
      .addOnFailureListener { e ->
        pending.remove(endpointId)
        Log.w(TAG, "requestConnection failed: ${e.message}")
      }
  }

  private val lifecycle = object : ConnectionLifecycleCallback() {
    override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
      names[endpointId] = info.endpointName
      // Prototype: auto-accept any RescueMesh peer (same SERVICE_ID). Messages
      // are validated by the engine; see README "Security" for the trade-off.
      client.acceptConnection(endpointId, payloads)
    }

    override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
      pending.remove(endpointId)
      if (result.status.isSuccess) {
        connected.add(endpointId)
        emit("connected", endpointId, names[endpointId])
      } else {
        Log.w(TAG, "connection to $endpointId failed: ${result.status.statusCode}")
      }
    }

    override fun onDisconnected(endpointId: String) {
      connected.remove(endpointId)
      emit("disconnected", endpointId)
    }
  }

  private val payloads = object : PayloadCallback() {
    override fun onPayloadReceived(endpointId: String, payload: Payload) {
      if (payload.type != Payload.Type.BYTES) return
      val bytes = payload.asBytes() ?: return
      val map = Arguments.createMap().apply {
        putString("type", "data")
        putString("peerId", endpointId)
        putString("data", String(bytes, StandardCharsets.UTF_8))
      }
      reactApplicationContext.emitDeviceEvent(EVENT, map)
    }

    override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {}
  }

  // ---------------------------------------------------------------- events

  private fun emit(type: String, endpointId: String, endpointName: String? = null) {
    val map = Arguments.createMap().apply {
      putString("type", type)
      putString("peerId", endpointId)
      if (endpointName != null) {
        putString("deviceId", endpointName.substringBefore('|'))
        putString("name", endpointName.substringAfter('|', endpointName))
      }
    }
    reactApplicationContext.emitDeviceEvent(EVENT, map)
  }

  private fun emitState(state: String, detail: String?) {
    val map = Arguments.createMap().apply {
      putString("type", "state")
      putString("state", state)
      if (detail != null) putString("detail", detail)
    }
    reactApplicationContext.emitDeviceEvent(EVENT, map)
  }

  override fun invalidate() {
    if (running) {
      client.stopAdvertising()
      client.stopDiscovery()
      client.stopAllEndpoints()
      running = false
    }
    super.invalidate()
  }
}
