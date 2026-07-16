import { z } from "zod"

export const MAX_MESSAGE_LENGTH = 4000
export const MAX_GROUP_NAME_LENGTH = 80
export const MAX_GROUP_MEMBERS = 256
export const MAX_SPACE_NAME_LENGTH = 80
export const MAX_CHANNEL_NAME_LENGTH = 60

export const pushNotifyBodySchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
})

export const pushStatusReplyBodySchema = z.object({
  statusId: z.string().uuid(),
  replyId: z.string().uuid(),
})

export const messageTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_MESSAGE_LENGTH)

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "שם הקבוצה לא יכול להיות ריק")
  .max(MAX_GROUP_NAME_LENGTH, "שם הקבוצה ארוך מדי")

export const spaceNameSchema = z
  .string()
  .trim()
  .min(1, "שם ה־Space לא יכול להיות ריק")
  .max(MAX_SPACE_NAME_LENGTH, "שם ה־Space ארוך מדי")

export const channelNameSchema = z
  .string()
  .trim()
  .min(1, "שם הערוץ לא יכול להיות ריק")
  .max(MAX_CHANNEL_NAME_LENGTH, "שם הערוץ ארוך מדי")

export const emailSchema = z.string().trim().email()

export function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value).success
}
