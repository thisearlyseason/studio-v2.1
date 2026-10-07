"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, id, disabled, ...props }, forwardedRef) => {
    const generatedId = React.useId()
    const inputId = id || generatedId
    const inputRef = React.useRef<HTMLInputElement | null>(null)
    const [visible, setVisible] = React.useState(false)
    const selection = React.useRef<{ start: number | null; end: number | null; direction: "forward" | "backward" | "none" | null } | null>(null)

    React.useLayoutEffect(() => {
      const input = inputRef.current
      const saved = selection.current
      if (input && saved && document.activeElement === input) {
        input.setSelectionRange(saved.start, saved.end, saved.direction || undefined)
      }
      selection.current = null
    }, [visible])

    return (
      <div className="relative">
        <Input
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...props}
          id={inputId}
          disabled={disabled}
          type={visible ? "text" : "password"}
          className={cn(className, "pr-20")}
          ref={node => {
            inputRef.current = node
            if (typeof forwardedRef === "function") forwardedRef(node)
            else if (forwardedRef) forwardedRef.current = node
          }}
        />
        <button
          type="button"
          disabled={disabled}
          aria-controls={inputId}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 min-h-11 min-w-16 -translate-y-1/2 rounded-md px-2 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          onPointerDown={event => {
            if (document.activeElement === inputRef.current) event.preventDefault()
          }}
          onClick={() => {
            const input = inputRef.current
            if (input && document.activeElement === input) {
              selection.current = { start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection }
            }
            setVisible(value => !value)
          }}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
