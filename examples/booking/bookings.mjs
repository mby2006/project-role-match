export function registerBookings(router, db) {
  router.post("/bookings", async (request, response) => {
    const { userId, slotId } = request.body;
    const booking = await db.one(
      "INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2) " +
        "ON CONFLICT (user_id, slot_id) DO UPDATE SET slot_id = EXCLUDED.slot_id " +
        "RETURNING id",
      [userId, slotId],
    );
    response.json(booking);
  });
}
