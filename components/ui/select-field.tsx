"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface SelectFieldOption {
  disabled?: boolean;
  label: React.ReactNode;
  value: string;
}

interface SelectFieldGroup {
  label?: React.ReactNode;
  options: SelectFieldOption[];
}

interface SelectFieldProps
  extends Omit<
    React.ComponentProps<"select">,
    "children" | "onChange"
  > {
  children: React.ReactNode;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

function isOptionElement(
  child: React.ReactNode
): child is React.ReactElement<React.ComponentProps<"option">> {
  return React.isValidElement(child) && child.type === "option";
}

function isOptGroupElement(
  child: React.ReactNode
): child is React.ReactElement<React.ComponentProps<"optgroup">> {
  return React.isValidElement(child) && child.type === "optgroup";
}

function extractOptions(children: React.ReactNode): SelectFieldGroup[] {
  const groups: SelectFieldGroup[] = [];

  React.Children.forEach(children, (child) => {
    if (isOptionElement(child)) {
      groups.push({
        options: [
          {
            disabled: child.props.disabled,
            label: child.props.children,
            value:
              typeof child.props.value === "string"
                ? child.props.value
                : String(child.props.value ?? ""),
          },
        ],
      });
      return;
    }

    if (!isOptGroupElement(child)) {
      return;
    }

    const options: SelectFieldOption[] = [];
    React.Children.forEach(child.props.children, (groupChild) => {
      if (!isOptionElement(groupChild)) {
        return;
      }

      options.push({
        disabled: groupChild.props.disabled,
        label: groupChild.props.children,
        value:
          typeof groupChild.props.value === "string"
            ? groupChild.props.value
            : String(groupChild.props.value ?? ""),
      });
    });

    groups.push({
      label: child.props.label,
      options,
    });
  });

  return groups;
}

function createSyntheticSelectChangeEvent(
  name: string | undefined,
  value: string
): React.ChangeEvent<HTMLSelectElement> {
  const target = {
    name: name || "",
    value,
  } as HTMLSelectElement;

  return {
    target,
    currentTarget: target,
  } as React.ChangeEvent<HTMLSelectElement>;
}

function SelectField({
  autoComplete,
  children,
  className,
  defaultValue,
  disabled,
  id,
  name,
  onChange,
  required,
  value,
}: SelectFieldProps) {
  const groups = React.useMemo(() => extractOptions(children), [children]);
  const flatOptions = React.useMemo(
    () => groups.flatMap((group) => group.options),
    [groups]
  );
  const labelsByValue = React.useMemo(
    () =>
      new Map(
        flatOptions.map((option) => [option.value, option.label] as const)
      ),
    [flatOptions]
  );
  const placeholder =
    labelsByValue.get("") || flatOptions[0]?.label || "Выберите значение";

  return (
    <Select
      autoComplete={autoComplete}
      defaultValue={
        defaultValue === undefined || defaultValue === null
          ? undefined
          : String(defaultValue)
      }
      disabled={disabled}
      id={id}
      name={name}
      onValueChange={(nextValue) => {
        onChange?.(
          createSyntheticSelectChangeEvent(name, String(nextValue ?? ""))
        );
      }}
      required={required}
      value={
        value === undefined || value === null ? undefined : String(value)
      }
      items={flatOptions.map((option) => ({
        label: option.label,
        value: option.value,
      }))}
    >
      <SelectTrigger
        className={cn(
          "h-11 w-full justify-between rounded-md border border-input bg-card px-4 py-2.5 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15",
          className
        )}
      >
        <SelectValue
          placeholder={placeholder}
          className="min-w-0 truncate"
        >
          {(selectedValue) =>
            labelsByValue.get(String(selectedValue ?? "")) || placeholder
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger>
        {groups.map((group, groupIndex) =>
          group.label ? (
            <SelectGroup key={`group-${groupIndex}`}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem
                  key={`${groupIndex}-${option.value || "empty"}`}
                  disabled={option.disabled}
                  value={option.value}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : (
            group.options.map((option) => (
              <SelectItem
                key={`${groupIndex}-${option.value || "empty"}`}
                disabled={option.disabled}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))
          )
        )}
      </SelectContent>
    </Select>
  );
}

export { SelectField };
