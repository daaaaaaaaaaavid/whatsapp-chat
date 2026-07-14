"use client"

import { Check, CheckCheck, Clock } from "lucide-react"

type Props = {
  status: "sending" | "sent" | "delivered" | "read"
}

export function MessageTicks({ status }: Props) {
  if (status === "sending") return <Clock className="h-3.5 w-3.5 text-[var(--wa-text-secondary)]" />
  if (status === "sent") return <Check className="h-4 w-4 text-[var(--wa-text-secondary)]" />
  if (status === "delivered") return <CheckCheck className="h-4 w-4 text-[var(--wa-text-secondary)]" />
  return <CheckCheck className="h-4 w-4 text-[#53bdeb]" />
}
