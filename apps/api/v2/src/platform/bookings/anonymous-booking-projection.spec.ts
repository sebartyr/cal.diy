import {
  toAnonymousBookingInfo_2024_04_15,
  toAnonymousBookingOutput_2024_08_13,
} from "./anonymous-booking-projection";

describe("anonymous booking projection", () => {
  const booking_2024_08_13 = {
    id: 1,
    uid: "abc",
    title: "Intro call",
    start: "2026-12-01T10:00:00.000Z",
    status: "accepted",
    hosts: [{ id: 20, name: "Host", email: "host@example.com", username: "host", timeZone: "Europe/Paris" }],
    attendees: [
      {
        name: "Ada",
        email: "ada@example.com",
        displayEmail: "ada@example.com",
        phoneNumber: "+33600000000",
        timeZone: "Europe/Paris",
        absent: false,
      },
    ],
    guests: ["guest@example.com"],
    bookingFieldsResponses: { email: "ada@example.com", notes: "private" },
    metadata: { crmId: "42" },
    location: "https://meet.example.com/secret-room",
    meetingUrl: "https://meet.example.com/secret-room",
    cancelledByEmail: "host@example.com",
    rescheduledByEmail: "ada@example.com",
  };

  describe("2024-08-13 and later", () => {
    it("keeps the booking but drops the personal data", () => {
      const anonymized = toAnonymousBookingOutput_2024_08_13(booking_2024_08_13);

      expect(anonymized).toMatchObject({ id: 1, uid: "abc", title: "Intro call", status: "accepted" });
      expect(anonymized.attendees).toEqual([{ name: "Ada", timeZone: "Europe/Paris", absent: false }]);
      expect(anonymized.hosts).toEqual([{ id: 20, name: "Host", username: "host", timeZone: "Europe/Paris" }]);
      expect(anonymized.guests).toEqual([]);
      expect(anonymized.bookingFieldsResponses).toEqual({});
      expect(anonymized.metadata).toEqual({});
      expect(anonymized.location).toBeUndefined();
      expect(anonymized.meetingUrl).toBeUndefined();
      expect(JSON.stringify(anonymized)).not.toMatch(/@example\.com|\+336|secret-room|private/);
    });

    it("keeps a physical address", () => {
      const anonymized = toAnonymousBookingOutput_2024_08_13({ ...booking_2024_08_13, location: "1 rue de Rivoli" });

      expect(anonymized.location).toBe("1 rue de Rivoli");
    });

    it("anonymizes every recurrence of a recurring booking", () => {
      const anonymized = toAnonymousBookingOutput_2024_08_13([booking_2024_08_13, booking_2024_08_13]);

      expect(JSON.stringify(anonymized)).not.toMatch(/@example\.com/);
      expect(anonymized).toHaveLength(2);
    });

    it("drops the per-seat answers of seated attendees", () => {
      const seated = {
        ...booking_2024_08_13,
        attendees: [{ ...booking_2024_08_13.attendees[0], seatUid: "s1", bookingFieldsResponses: { notes: "x" } }],
      };

      expect(toAnonymousBookingOutput_2024_08_13(seated).attendees).toEqual([
        { name: "Ada", timeZone: "Europe/Paris", absent: false, seatUid: "s1" },
      ]);
    });

    it("does not mutate the original output", () => {
      toAnonymousBookingOutput_2024_08_13(booking_2024_08_13);

      expect(booking_2024_08_13.attendees[0].email).toBe("ada@example.com");
    });
  });

  describe("2024-04-15 (default version)", () => {
    const bookingInfo = {
      id: 1,
      uid: "abc",
      title: "Intro call",
      description: "My phone is +33600000000",
      smsReminderNumber: "+33600000000",
      userPrimaryEmail: "host@example.com",
      cancelledBy: "host@example.com",
      rescheduledBy: "ada@example.com",
      responses: { email: "ada@example.com", name: "Ada" },
      customInputs: { company: "ACME" },
      location: "https://meet.example.com/secret-room",
      metadata: { videoCallUrl: "https://meet.example.com/secret-room", other: "kept" },
      tracking: { utm_source: "newsletter" },
      user: { id: 20, name: "Host", email: "host@example.com", username: "host" },
      attendees: [{ name: "Ada", email: "ada@example.com", phoneNumber: "+33600000000", timeZone: "UTC" }],
    };

    it("keeps the booking but drops the personal data", () => {
      const anonymized = toAnonymousBookingInfo_2024_04_15(bookingInfo);

      expect(anonymized).toMatchObject({ id: 1, uid: "abc", title: "Intro call" });
      expect(anonymized.attendees).toEqual([{ name: "Ada", timeZone: "UTC" }]);
      expect(anonymized.user).toEqual({ id: 20, name: "Host", username: "host" });
      expect(anonymized.metadata).toEqual({ other: "kept" });
      expect(anonymized).not.toHaveProperty("smsReminderNumber");
      expect(anonymized).not.toHaveProperty("userPrimaryEmail");
      expect(anonymized).not.toHaveProperty("tracking");
      expect(JSON.stringify(anonymized)).not.toMatch(/@example\.com|\+336|secret-room|ACME/);
    });
  });
});
