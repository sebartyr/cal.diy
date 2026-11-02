import type { ReactElement, Ref } from "react";
import React, { forwardRef } from "react";
import type { FieldValues, SubmitHandler, UseFormReturn } from "react-hook-form";
import { FormProvider } from "react-hook-form";

import { getErrorFromUnknown } from "@calcom/lib/errors";

import { showToast } from "../../toast";

// TTransformedValues is what the resolver hands to handleSubmit, e.g. a zod schema's output.
type FormProps<TFieldValues extends FieldValues, TContext, TTransformedValues> = {
  form: UseFormReturn<TFieldValues, TContext, TTransformedValues>;
  handleSubmit: SubmitHandler<TTransformedValues>;
} & Omit<JSX.IntrinsicElements["form"], "onSubmit">;

const PlainForm = <TFieldValues extends FieldValues, TContext, TTransformedValues>(
  props: FormProps<TFieldValues, TContext, TTransformedValues>,
  ref: Ref<HTMLFormElement>
) => {
  const { form, handleSubmit, ...passThrough } = props;

  return (
    <FormProvider {...form}>
      <form
        ref={ref}
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();

          form
            .handleSubmit(handleSubmit)(event)
            .catch((err) => {
              // FIXME: Booking Pages don't have toast, so this error is never shown
              showToast(`${getErrorFromUnknown(err).message}`, "error");
            });
        }}
        {...passThrough}>
        {props.children}
      </form>
    </FormProvider>
  );
};

export const Form = forwardRef(PlainForm) as <
  TFieldValues extends FieldValues,
  TContext = unknown,
  TTransformedValues = TFieldValues,
>(
  p: FormProps<TFieldValues, TContext, TTransformedValues> & { ref?: Ref<HTMLFormElement> }
) => ReactElement;
