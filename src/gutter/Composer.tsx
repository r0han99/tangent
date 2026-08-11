import { useEffect, useRef, useState } from "react";
import type { Usage } from "@/api/types";
import { useStore } from "@/state/store";

interface ComposerProps {
  disabled: boolean;
  model: string;
  usage: Usage;
  placeholder: string;
  /** Preserve typed text across error/retry by lifting the initial value. */
  initialValue?: string;
  /** When false, show a fixed label instead of the model dropdown (ChatGPT/Gemini). */
  showModelPicker?: boolean;
  onModelChange: (model: string) => void;
  onSubmit: (text: string) => void;
  autoFocus?: boolean;
}

/** The per-bubble input: textarea, model selector, usage footer. (PRD 6.6, 7) */
export function Composer({
  disabled,
  model,
  usage,
  placeholder,
  initialValue = "",
  showModelPicker = true,
  onModelChange,
  onSubmit,
  autoFocus
}: ComposerProps) {
  const [text, setText] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);
  const availableModels = useStore((s) => s.availableModels);
  const modelLabel =
    availableModels.find((m) => m.id === model)?.label ??
    availableModels[0]?.label ??
    model;

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSubmit(value);
    setText("");
  };

  return (
    <div className="tg-composer">
      <textarea
        ref={ref}
        className="tg-composer-input"
        rows={1}
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="tg-composer-footer">
        {showModelPicker ? (
          <select
            className="tg-model-select"
            value={model}
            disabled={disabled}
            onChange={(e) => onModelChange(e.target.value)}
            title="Model for this offthread"
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="tg-model-locked" title="Fixed Offthread model for this API">
            {modelLabel}
          </span>
        )}
        <span className="tg-usage" title="Session usage">
          {usage.percent == null ? "" : `${usage.percent}% used`}
        </span>
        <button
          type="button"
          className="tg-send"
          disabled={disabled || text.trim().length === 0}
          onClick={submit}
        >
          Ask
        </button>
      </div>
    </div>
  );
}
