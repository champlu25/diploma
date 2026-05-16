import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import clsx from "clsx";
import styles from "./Field.module.scss";

export interface FieldProps {
  label: string;
  helperText?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, helperText, error, className, children }: FieldProps) {
  return (
    <label className={clsx(styles.field, className)}>
      <span className={styles.label}>{label}</span>
      {children}
      {(error || helperText) && (
        <span className={clsx(styles.helper, error && styles.error)}>{error ?? helperText}</span>
      )}
    </label>
  );
}

export type InputFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "children"> & {
  label: string;
  helperText?: string;
  error?: string;
  className?: string;
};

export function InputField({ label, helperText, error, className, ...rest }: InputFieldProps) {
  return (
    <Field label={label} helperText={helperText} error={error} className={className}>
      <input className={styles.control} aria-invalid={Boolean(error)} {...rest} />
    </Field>
  );
}

export type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "children"> & {
  label: string;
  helperText?: string;
  error?: string;
  className?: string;
};

export function TextAreaField({
  label,
  helperText,
  error,
  className,
  ...rest
}: TextAreaFieldProps) {
  return (
    <Field label={label} helperText={helperText} error={error} className={className}>
      <textarea className={clsx(styles.control, styles.textarea)} aria-invalid={Boolean(error)} {...rest} />
    </Field>
  );
}

export type SelectFieldOption = { value: string; label: string; disabled?: boolean };

export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label: string;
  helperText?: string;
  error?: string;
  className?: string;
  options: SelectFieldOption[];
};

export function SelectField({
  label,
  helperText,
  error,
  className,
  options,
  ...rest
}: SelectFieldProps) {
  return (
    <Field label={label} helperText={helperText} error={error} className={className}>
      <select className={styles.control} aria-invalid={Boolean(error)} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
