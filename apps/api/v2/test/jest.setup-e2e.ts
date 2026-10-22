import type { INestApplication, NestApplicationOptions } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { TestingModule } from "@nestjs/testing";
import qs from "qs";

jest.retryTimes(process.env.CI ? 2 : 0); // Global retry for all tests

// Specs call moduleRef.createNestApplication() with no options, but createNestApp() in src/main.ts disables
// Nest's body parser (the API's own body middlewares parse requests) and sets a custom query parser. Without
// the same settings, every request with a body is parsed twice under Express 5 and fails with a 500
// "stream is not readable", so mirror production here instead of in each of the specs.
const createNestApplication = TestingModule.prototype.createNestApplication;
TestingModule.prototype.createNestApplication = function <T extends INestApplication = INestApplication>(
  this: TestingModule,
  ...args: unknown[]
): T {
  if (args.length > 0) {
    return Reflect.apply(createNestApplication, this, args);
  }
  const options: NestApplicationOptions = { bodyParser: false };
  const app = Reflect.apply(createNestApplication, this, [options]) as NestExpressApplication;
  app.set("query parser", (str: string) => qs.parse(str, { arrayLimit: 1000 }));
  return app as unknown as T;
};
