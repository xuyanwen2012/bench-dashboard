import { ChevronDownIcon } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Checkbox } from "@/components/ui/checkbox";
import type { Filters, MetaCat } from "../api";

// Each dimension holds zero or more values, comma-joined in state and in the
// URL ("model=1b,3b"); empty = any. db.ts expands multi-values to SQL IN (...).
const split = (v: string | undefined) => (v ? v.split(",").filter(Boolean) : []);

const DIMS = [
  { key: "device", list: "devices", label: "device" },
  { key: "branch", list: "branches", label: "branch" },
  { key: "driver_ver", list: "driver_vers", label: "driver" },
  { key: "model", list: "models", label: "model" },
] as const;

// Faceted narrowing: a dropdown offers only values that co-occur (in meta's
// distinct-tuple list) with the OTHER dimensions' selections — never narrowed
// by its own selection, and already-selected values always stay listed so a
// stale pick can be unchecked.
function narrowedOptions(
  dim: (typeof DIMS)[number],
  options: MetaCat | null,
  filters: Filters,
): string[] {
  if (!options) return [];
  const others = DIMS.filter((d) => d.key !== dim.key);
  const avail = new Set(
    options.combos
      .filter((c) =>
        others.every((d) => {
          const sel = split(filters[d.key]);
          return sel.length === 0 || (c[d.key] != null && sel.includes(c[d.key] as string));
        }),
      )
      .map((c) => c[dim.key]),
  );
  const sel = split(filters[dim.key]);
  return options[dim.list].filter((v) => avail.has(v) || sel.includes(v));
}

function FilterMultiSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const sel = split(value);
  const toggle = (o: string, on: boolean) => {
    const next = on ? [...sel, o] : sel.filter((x) => x !== o);
    // keep meta's option order so equal selections serialize identically
    onChange(options.filter((x) => next.includes(x)).join(","));
  };
  const display =
    sel.length === 0 ? "any" : sel.length <= 2 ? sel.join(", ") : `${sel.length} selected`;
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Popover trigger renders a native <button>, a labelable element biome can't see through
    <label className="flex items-center gap-1.5 text-ink2">
      <span className="text-[11px] uppercase tracking-wide">{label}</span>
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger
          data-filter={label}
          className={`flex h-8 w-48 items-center justify-between gap-2 rounded-md border border-input bg-surface px-3 font-mono text-[12px] whitespace-nowrap shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
            sel.length === 0 ? "text-ink3" : "text-ink"
          }`}
        >
          <span className="truncate">{display}</span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className="z-50 min-w-[12rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {options.map((o) => (
              // biome-ignore lint/a11y/noLabelWithoutControl: Radix Checkbox renders a native <button role="checkbox">, a labelable element biome can't see through
              <label
                key={o}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 font-mono text-[12px] text-ink2 hover:bg-raised hover:text-ink"
              >
                <Checkbox
                  checked={sel.includes(o)}
                  onCheckedChange={(c) => toggle(o, c === true)}
                />
                {o}
              </label>
            ))}
            {sel.length > 0 && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="mt-1 w-full rounded border-t border-edge px-2 py-1 text-left text-[11px] text-ink3 hover:bg-raised hover:text-ink"
              >
                any {label}
              </button>
            )}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </label>
  );
}

export default function FilterBar({
  options,
  filters,
  onChange,
}: {
  options: MetaCat | null;
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-3 py-2 border-b border-edge bg-surface">
      {DIMS.map((d) => (
        <FilterMultiSelect
          key={d.key}
          label={d.label}
          value={filters[d.key] ?? ""}
          options={narrowedOptions(d, options, filters)}
          onChange={(v) => onChange({ ...filters, [d.key]: v })}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange({})}
        disabled={!(filters.device || filters.branch || filters.driver_ver || filters.model)}
        className="ml-auto px-2 py-0.5 rounded border border-edge text-[12px] text-ink2 hover:text-ink hover:bg-raised disabled:opacity-40 disabled:pointer-events-none"
      >
        clear
      </button>
    </div>
  );
}
