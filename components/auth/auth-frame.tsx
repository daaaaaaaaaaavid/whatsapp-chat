import type { ReactNode } from "react"
import { Logo } from "@/components/brand/logo"

type Props = {
  children: ReactNode
  footer?: ReactNode
}

/** Centered glass card on the aurora stage. Shared by auth screens. */
export function AuthFrame({ children, footer }: Props) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 flex justify-center">
          <Logo size={11} withWordmark wordmarkClassName="text-[1.7rem]" />
        </div>
        <div className="wa-auth-card p-7 sm:p-8">{children}</div>
        {footer}
      </div>
    </div>
  )
}
