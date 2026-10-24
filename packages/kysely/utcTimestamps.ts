import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  PrimitiveValueListNode,
  QueryResult,
  RootOperationNode,
  UnknownRow,
  ValueNode,
} from "kysely";
import { OperationNodeTransformer } from "kysely";
import type { CustomTypesConfig } from "pg";
import { types } from "pg";

// Prisma stores DateTime columns as `timestamp without time zone` holding UTC wall-clock time. node-postgres
// reads and writes that type in the process' local time zone, so any server not running in UTC shifts every
// date going through Kysely by its UTC offset. These helpers make Kysely agree with Prisma.

const TIMESTAMP_OID = 1114;

function toIsoString(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

class DateToIsoStringTransformer extends OperationNodeTransformer {
  protected override transformValue(node: ValueNode): ValueNode {
    return { ...super.transformValue(node), value: toIsoString(node.value) };
  }

  protected override transformPrimitiveValueList(node: PrimitiveValueListNode): PrimitiveValueListNode {
    return { ...super.transformPrimitiveValueList(node), values: node.values.map(toIsoString) };
  }
}

/**
 * Sends Date parameters as ISO strings: PostgreSQL drops the trailing "Z" when casting to
 * `timestamp without time zone`, which leaves the UTC wall-clock time Prisma expects.
 */
export class UtcTimestampPlugin implements KyselyPlugin {
  private readonly transformer = new DateToIsoStringTransformer();

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return this.transformer.transformNode(args.node);
  }

  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return args.result;
  }
}

const PLAIN_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

export function parseUtcTimestamp(value: string): unknown {
  // infinity and BC dates keep node-postgres' own handling.
  if (!PLAIN_TIMESTAMP.test(value)) return types.getTypeParser(TIMESTAMP_OID, "text")(value);
  return new Date(`${value.replace(" ", "T")}Z`);
}

function getTypeParser(oid: number, format?: "text" | "binary") {
  if (format === "binary") return types.getTypeParser(oid, "binary");
  if (oid === TIMESTAMP_OID) return parseUtcTimestamp;
  return types.getTypeParser(oid, "text");
}

/** Pool `types` option reading `timestamp without time zone` columns as UTC. */
export const utcTimestampTypes: CustomTypesConfig = {
  getTypeParser: getTypeParser as CustomTypesConfig["getTypeParser"],
};
