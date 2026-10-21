"use client";

import { useId, type ReactNode } from "react";
import { get, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { Checkbox, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { CheckboxField, Field, fieldAria } from "./field";

type BaseProps<T extends FieldValues> = {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: ReactNode;
  description?: ReactNode;
  required?: boolean;
  className?: string;
  disabled?: boolean;
};

function errorMessage<T extends FieldValues>(form: UseFormReturn<T>, name: Path<T>): string | undefined {
  const error = get(form.formState.errors, name) as { message?: string } | undefined;
  return error?.message;
}

export function TextInput<T extends FieldValues>({
  form,
  name,
  label,
  description,
  required,
  className,
  disabled,
  type = "text",
  dir,
  inputMode,
  placeholder,
  autoComplete,
}: BaseProps<T> & {
  type?: string;
  dir?: "ltr" | "rtl" | "auto";
  inputMode?: "text" | "decimal" | "numeric" | "email" | "url" | "search";
  placeholder?: string;
  autoComplete?: string;
}) {
  const id = useId();
  const error = errorMessage(form, name);
  return (
    <Field id={id} label={label} error={error} description={description} required={required} className={className}>
      <Input
        type={type}
        dir={dir}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete ?? "off"}
        disabled={disabled}
        {...fieldAria(id, error, !!description)}
        {...form.register(name)}
        data-field={name}
      />
    </Field>
  );
}

export function TextAreaInput<T extends FieldValues>({
  form,
  name,
  label,
  description,
  required,
  className,
  disabled,
  rows = 3,
  dir,
}: BaseProps<T> & { rows?: number; dir?: "ltr" | "rtl" | "auto" }) {
  const id = useId();
  const error = errorMessage(form, name);
  return (
    <Field id={id} label={label} error={error} description={description} required={required} className={className}>
      <Textarea
        rows={rows}
        dir={dir}
        disabled={disabled}
        {...fieldAria(id, error, !!description)}
        {...form.register(name)}
        data-field={name}
      />
    </Field>
  );
}

export function SelectInput<T extends FieldValues>({
  form,
  name,
  label,
  description,
  required,
  className,
  disabled,
  options,
  placeholder,
}: BaseProps<T> & { options: Array<{ value: string; label: string; disabled?: boolean }>; placeholder?: string }) {
  const id = useId();
  const error = errorMessage(form, name);
  return (
    <Field id={id} label={label} error={error} description={description} required={required} className={className}>
      <NativeSelect
        disabled={disabled}
        {...fieldAria(id, error, !!description)}
        {...form.register(name)}
        data-field={name}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

export function CheckboxInput<T extends FieldValues>({ form, name, label, description, disabled }: BaseProps<T>) {
  const id = useId();
  return (
    <CheckboxField id={id} label={label} description={description}>
      <Checkbox id={id} disabled={disabled} {...form.register(name)} data-field={name} />
    </CheckboxField>
  );
}

/** Translated summary of an error not tied to a visible field (e.g. "_form"). */
export function FormErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {message}
    </p>
  );
}
