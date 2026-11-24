"""Enumerations shared by models and schemas.

Two separate state machines are kept deliberately:

* DeliveryStatus  - did the *message* reach the rescue system? (communication)
* RescueStatus    - what is happening on the *ground*?           (operations)

The mobile app has a richer local delivery model (CREATED_LOCAL, RELAYED,
GATEWAY_REACHED, ...). The server only ever asserts the states it can verify
itself: it received the message, and a coordinator acknowledged it.
"""
import enum


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    COORDINATOR = "COORDINATOR"


class EmergencyType(str, enum.Enum):
    MEDICAL = "MEDICAL"
    TRAPPED = "TRAPPED"
    FIRE = "FIRE"
    FLOOD = "FLOOD"
    OTHER = "OTHER"


class Priority(str, enum.Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class DeliveryStatus(str, enum.Enum):
    SERVER_RECEIVED = "SERVER_RECEIVED"
    COORDINATOR_ACKNOWLEDGED = "COORDINATOR_ACKNOWLEDGED"


class RescueStatus(str, enum.Enum):
    RECEIVED = "RECEIVED"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CANCELLED = "CANCELLED"


class IngestChannel(str, enum.Enum):
    DIRECT = "DIRECT"    # originating phone had internet and posted it itself
    GATEWAY = "GATEWAY"  # uploaded by another phone acting as an internet gateway


class RelayTransport(str, enum.Enum):
    LOCAL = "LOCAL"          # created on this device
    NEARBY = "NEARBY"        # real device-to-device transfer (Google Nearby Connections: BLE/BT/Wi-Fi)
    SIMULATED = "SIMULATED"  # in-app simulation - never real radio traffic
    INTERNET = "INTERNET"    # HTTP upload to this server


class VolunteerStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    BUSY = "BUSY"
    OFF_DUTY = "OFF_DUTY"


class AssignmentStatus(str, enum.Enum):
    ASSIGNED = "ASSIGNED"
    EN_ROUTE = "EN_ROUTE"
    ON_SITE = "ON_SITE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class AckType(str, enum.Enum):
    SERVER_RECEIPT = "SERVER_RECEIPT"
    COORDINATOR_ACK = "COORDINATOR_ACK"
