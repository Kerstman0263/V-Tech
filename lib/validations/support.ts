import { z } from "zod";

export const sendMessageSchema = z.object({
  body: z.string().min(1, "Bericht mag niet leeg zijn").max(2000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
