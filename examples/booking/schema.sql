CREATE TABLE bookings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL,
  slot_id bigint NOT NULL,
  UNIQUE (user_id, slot_id)
);
