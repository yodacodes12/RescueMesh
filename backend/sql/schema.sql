-- RescueMesh schema (generated from SQLAlchemy models by `python -m app.init_db`).
-- Reference DDL only: init_db creates these tables directly.

CREATE TABLE devices (
	id SERIAL NOT NULL, 
	device_id VARCHAR(64) NOT NULL, 
	display_name VARCHAR(64), 
	is_simulated BOOLEAN NOT NULL, 
	last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_devices_device_id ON devices (device_id);

CREATE TABLE users (
	id SERIAL NOT NULL, 
	username VARCHAR(64) NOT NULL, 
	full_name VARCHAR(128) NOT NULL, 
	hashed_password VARCHAR(128) NOT NULL, 
	role VARCHAR(32) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_users_username ON users (username);

CREATE TABLE volunteers (
	id SERIAL NOT NULL, 
	name VARCHAR(128) NOT NULL, 
	phone VARCHAR(32), 
	team_name VARCHAR(128), 
	skills VARCHAR(256), 
	status VARCHAR(32) NOT NULL, 
	latitude FLOAT, 
	longitude FLOAT, 
	is_demo BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id)
);

CREATE INDEX ix_volunteers_status ON volunteers (status);

CREATE TABLE sos_requests (
	id SERIAL NOT NULL, 
	message_id UUID NOT NULL, 
	sender_device_id INTEGER NOT NULL, 
	sender_name VARCHAR(64), 
	emergency_type VARCHAR(32) NOT NULL, 
	priority VARCHAR(32) NOT NULL, 
	original_priority VARCHAR(32) NOT NULL, 
	latitude FLOAT, 
	longitude FLOAT, 
	location_accuracy_m FLOAT, 
	description TEXT NOT NULL, 
	people_affected INTEGER, 
	device_created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	expiry_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	hop_count INTEGER NOT NULL, 
	is_simulated BOOLEAN NOT NULL, 
	received_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	received_via VARCHAR(32) NOT NULL, 
	gateway_device_id INTEGER, 
	duplicate_receipts INTEGER NOT NULL, 
	delivery_status VARCHAR(32) NOT NULL, 
	rescue_status VARCHAR(32) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(sender_device_id) REFERENCES devices (id), 
	FOREIGN KEY(gateway_device_id) REFERENCES devices (id)
);

CREATE INDEX ix_sos_status_priority ON sos_requests (rescue_status, priority);
CREATE INDEX ix_sos_requests_is_simulated ON sos_requests (is_simulated);
CREATE INDEX ix_sos_requests_priority ON sos_requests (priority);
CREATE INDEX ix_sos_requests_rescue_status ON sos_requests (rescue_status);
CREATE INDEX ix_sos_requests_received_at ON sos_requests (received_at);
CREATE INDEX ix_sos_requests_sender_device_id ON sos_requests (sender_device_id);
CREATE UNIQUE INDEX ix_sos_requests_message_id ON sos_requests (message_id);

CREATE TABLE delivery_acknowledgements (
	id SERIAL NOT NULL, 
	sos_id INTEGER NOT NULL, 
	ack_type VARCHAR(32) NOT NULL, 
	acknowledged_by_user_id INTEGER, 
	note TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_ack_per_type UNIQUE (sos_id, ack_type), 
	FOREIGN KEY(sos_id) REFERENCES sos_requests (id) ON DELETE CASCADE, 
	FOREIGN KEY(acknowledged_by_user_id) REFERENCES users (id)
);

CREATE INDEX ix_delivery_acknowledgements_sos_id ON delivery_acknowledgements (sos_id);

CREATE TABLE message_relay_history (
	id SERIAL NOT NULL, 
	sos_id INTEGER NOT NULL, 
	hop_index INTEGER NOT NULL, 
	device_id VARCHAR(64) NOT NULL, 
	device_name VARCHAR(64), 
	transport VARCHAR(32) NOT NULL, 
	received_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_relay_hop UNIQUE (sos_id, hop_index, device_id), 
	FOREIGN KEY(sos_id) REFERENCES sos_requests (id) ON DELETE CASCADE
);

CREATE INDEX ix_message_relay_history_sos_id ON message_relay_history (sos_id);

CREATE TABLE rescue_assignments (
	id SERIAL NOT NULL, 
	sos_id INTEGER NOT NULL, 
	volunteer_id INTEGER NOT NULL, 
	assigned_by_user_id INTEGER, 
	status VARCHAR(32) NOT NULL, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(sos_id) REFERENCES sos_requests (id) ON DELETE CASCADE, 
	FOREIGN KEY(volunteer_id) REFERENCES volunteers (id), 
	FOREIGN KEY(assigned_by_user_id) REFERENCES users (id)
);

CREATE INDEX ix_rescue_assignments_volunteer_id ON rescue_assignments (volunteer_id);
CREATE INDEX ix_rescue_assignments_sos_id ON rescue_assignments (sos_id);

CREATE TABLE sos_status_events (
	id SERIAL NOT NULL, 
	sos_id INTEGER NOT NULL, 
	event VARCHAR(48) NOT NULL, 
	from_value VARCHAR(48), 
	to_value VARCHAR(48), 
	note TEXT, 
	actor_user_id INTEGER, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(sos_id) REFERENCES sos_requests (id) ON DELETE CASCADE, 
	FOREIGN KEY(actor_user_id) REFERENCES users (id)
);

CREATE INDEX ix_sos_status_events_sos_id ON sos_status_events (sos_id);

