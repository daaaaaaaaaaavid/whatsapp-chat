"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

type Props = {
  children: ReactNode
  onClose?: () => void
  fallbackTitle?: string
}

type State = { error: Error | null }

/** Keeps a crash in contact-info from taking down the whole chat page. */
export class ConversationInfoBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ConversationInfo crashed", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <aside className="flex h-full w-full max-w-md flex-col items-center justify-center gap-3 border-r border-[var(--wa-border)] bg-[var(--wa-panel)] px-6 text-center lg:w-[360px]">
          <p className="text-[var(--wa-text)]">לא ניתן להציג את פרטי השיחה</p>
          <p className="text-sm text-[var(--wa-text-secondary)]">{this.state.error.message || "שגיאה לא צפויה"}</p>
          <button
            type="button"
            className="rounded-lg bg-[#00a884] px-4 py-2 text-sm text-white"
            onClick={() => {
              this.setState({ error: null })
              this.props.onClose?.()
            }}
          >
            סגור
          </button>
        </aside>
      )
    }
    return this.props.children
  }
}

/** Isolates crashes in the main chat pane so the sidebar stays usable. */
export class ChatPaneBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Chat pane crashed", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-[var(--wa-header)] px-6 text-center">
          <p className="text-[var(--wa-text)]">{this.props.fallbackTitle ?? "משהו השתבש בצ׳אט"}</p>
          <p className="max-w-md text-sm text-[var(--wa-text-secondary)]">{this.state.error.message || "שגיאה לא צפויה"}</p>
          <button
            type="button"
            className="rounded-lg bg-[#00a884] px-4 py-2 text-sm text-white"
            onClick={() => {
              this.setState({ error: null })
              this.props.onClose?.()
            }}
          >
            נסה שוב
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
