"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

type Props = {
  children: ReactNode
  onClose?: () => void
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
        <aside className="flex h-full w-full max-w-md flex-col items-center justify-center gap-3 border-r border-[#e9edef] bg-white px-6 text-center lg:w-[360px]">
          <p className="text-[#111b21]">לא ניתן להציג את פרטי השיחה</p>
          <p className="text-sm text-[#667781]">{this.state.error.message || "שגיאה לא צפויה"}</p>
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
