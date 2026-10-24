import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from "kysely";
import { describe, expect, it } from "vitest";
import { parseUtcTimestamp, UtcTimestampPlugin, utcTimestampTypes } from "./utcTimestamps";

type TestDB = { Booking: { id: number; startTime: Date } };

const db = new Kysely<TestDB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
  plugins: [new UtcTimestampPlugin()],
});

describe("UtcTimestampPlugin", () => {
  it("sends Date parameters as ISO strings", () => {
    const date = new Date("2030-02-11T13:00:00.000Z");

    const { parameters } = db.selectFrom("Booking").selectAll().where("startTime", ">=", date).compile();

    expect(parameters).toEqual(["2030-02-11T13:00:00.000Z"]);
  });

  it("converts dates inside lists and inserts", () => {
    const date = new Date("2030-02-11T13:00:00.000Z");

    const inList = db.selectFrom("Booking").selectAll().where("startTime", "in", [date]).compile();
    const insert = db.insertInto("Booking").values({ id: 1, startTime: date }).compile();

    expect(inList.parameters).toEqual(["2030-02-11T13:00:00.000Z"]);
    expect(insert.parameters).toEqual([1, "2030-02-11T13:00:00.000Z"]);
  });

  it("leaves other parameters untouched", () => {
    const { parameters } = db.selectFrom("Booking").selectAll().where("id", "=", 42).compile();

    expect(parameters).toEqual([42]);
  });
});

describe("utcTimestampTypes", () => {
  it("reads timestamp without time zone as UTC", () => {
    const parse = utcTimestampTypes.getTypeParser(1114, "text");

    expect(parse("2030-02-11 13:00:00")).toEqual(new Date("2030-02-11T13:00:00.000Z"));
    expect(parse("2030-02-11 13:00:00.123")).toEqual(new Date("2030-02-11T13:00:00.123Z"));
  });

  it("keeps node-postgres parsing for special values and other types", () => {
    expect(parseUtcTimestamp("infinity")).toBe(Infinity);
    expect(utcTimestampTypes.getTypeParser(23, "text")("7")).toBe(7);
  });
});
