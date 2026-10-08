import { authedNonImpersonatedProcedure } from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";
import { ZDeleteCredentialInputSchema } from "./deleteCredential.schema";

type CredentialsRouterHandlerCache = {
  deleteCredential?: typeof import("./deleteCredential.handler").deleteCredentialHandler;
};

export const credentialsRouter = router({
  delete: authedNonImpersonatedProcedure
    .input(ZDeleteCredentialInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { deleteCredentialHandler } = await import("./deleteCredential.handler");

      return deleteCredentialHandler({ ctx, input });
    }),
});
