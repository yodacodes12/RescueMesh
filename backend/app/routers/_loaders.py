from sqlalchemy.orm import selectinload

from app.models import RescueAssignment, SOSRequest, SOSStatusEvent, DeliveryAcknowledgement

# Eager-load everything to_out()/to_detail() touch, to avoid N+1 queries.
SOS_LIST_OPTIONS = (
    selectinload(SOSRequest.sender_device),
    selectinload(SOSRequest.gateway_device),
    selectinload(SOSRequest.assignments).selectinload(RescueAssignment.volunteer),
)
SOS_DETAIL_OPTIONS = SOS_LIST_OPTIONS + (
    selectinload(SOSRequest.relay_history),
    selectinload(SOSRequest.status_events).selectinload(SOSStatusEvent.actor),
    selectinload(SOSRequest.acknowledgements).selectinload(DeliveryAcknowledgement.acknowledged_by),
)
