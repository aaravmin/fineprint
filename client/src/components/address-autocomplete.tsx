"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { MapPin } from "lucide-react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

// NYC Planning Labs GeoSearch — the city's own geocoder. Free, no key, CORS-open.
const GEOSEARCH_URL = "https://geosearch.planninglabs.nyc/v2/autocomplete";
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 6;
const OPTION_HEIGHT = 44;
const LIST_PADDING = 12;
const GAP = 8;

interface GeoSearchFeature {
  properties?: {
    label?: string;
    borough?: string;
  };
}

interface ListPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

interface AddressAutocompleteProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Fires when the user picks a suggestion from the list. */
  onSelect?: (address: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

function cleanLabel(label: string): string {
  // "1 Wall St, Manhattan, NY, USA" → "1 Wall St, Manhattan"
  return label.replace(/, (NY|New York), USA$/i, "").replace(/, USA$/i, "");
}

export function AddressAutocomplete({
  value,
  onValueChange,
  onSelect,
  placeholder = "Enter a NYC building address",
  className,
  inputClassName,
}: AddressAutocompleteProps) {
  const listboxId = useId();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [position, setPosition] = useState<ListPosition | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A pick fills the input; that change must not immediately re-open the list.
  const skipNextFetch = useRef(false);

  // The list renders in a body portal with fixed positioning, so no ancestor
  // overflow can clip it and it never adds to the document's scroll height.
  // When the input sits low in the viewport, the list flips upward instead.
  const measure = useCallback((count: number) => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    const rect = input.getBoundingClientRect();
    const listHeight = count * OPTION_HEIGHT + LIST_PADDING;
    const spaceBelow = window.innerHeight - rect.bottom - GAP;
    const opensUpward = spaceBelow < listHeight && rect.top > spaceBelow;

    setPosition({
      left: rect.left + 8,
      width: rect.width - 16,
      ...(opensUpward ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
    });
  }, []);

  const fetchSuggestions = useCallback(
    async (query: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const url = `${GEOSEARCH_URL}?text=${encodeURIComponent(query)}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { features?: GeoSearchFeature[] };
        const labels = (data.features ?? [])
          .map((feature) => feature.properties?.label)
          .filter((label): label is string => Boolean(label))
          .map(cleanLabel)
          .slice(0, MAX_SUGGESTIONS);

        setSuggestions(labels);
        setOpen(labels.length > 0);
        setHighlighted(-1);
        if (labels.length > 0) {
          measure(labels.length);
        }
      } catch {
        // Network/abort failures just mean no suggestions — typing still works.
      }
    },
    [measure],
  );

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const query = value.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => fetchSuggestions(query), DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, fetchSuggestions]);

  // Keep the fixed-position list glued to the input through scroll and resize.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const sync = () => measure(suggestions.length);
    window.addEventListener("scroll", sync, { capture: true, passive: true });
    window.addEventListener("resize", sync);

    return () => {
      window.removeEventListener("scroll", sync, { capture: true });
      window.removeEventListener("resize", sync);
    };
  }, [open, suggestions.length, measure]);

  const pick = (address: string) => {
    skipNextFetch.current = true;
    onValueChange(address);
    setOpen(false);
    setSuggestions([]);
    onSelect?.(address);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      pick(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => {
          if (suggestions.length > 0) {
            measure(suggestions.length);
            setOpen(true);
          }
        }}
        type="text"
        role="combobox"
        aria-label={placeholder}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={highlighted >= 0 ? `${listboxId}-option-${highlighted}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        className={inputClassName}
      />

      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            id={listboxId}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: listbox/option is the WAI-ARIA combobox pattern; the input keeps focus and selection is driven by aria-activedescendant.
            role="listbox"
            aria-label="Address suggestions"
            style={{
              position: "fixed",
              left: position.left,
              width: position.width,
              top: position.top,
              bottom: position.bottom,
            }}
            className="z-[999] overflow-hidden rounded-2xl border border-border bg-card py-1.5 shadow-[0_2px_4px_rgba(20,20,20,0.04),0_12px_32px_-8px_rgba(20,20,20,0.16)]"
          >
            {suggestions.map((suggestion, index) => (
              // biome-ignore lint/a11y/useFocusableInteractive: options are activated through aria-activedescendant on the input, so they are not tab-focusable themselves.
              <li
                key={suggestion}
                id={`${listboxId}-option-${index}`}
                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: option is the WAI-ARIA combobox pattern for a listbox item.
                role="option"
                aria-selected={index === highlighted}
                // mousedown beats the input's blur, so the click still lands
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(suggestion);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm text-foreground transition-colors",
                  index === highlighted && "bg-secondary",
                )}
              >
                <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{suggestion}</span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
