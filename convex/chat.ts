import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Fetch the last 50 messages in real-time, ordered by creation time
export const list = query({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_created_at")
      .order("desc")
      .take(50);
    
    // Return in chronological order (oldest first)
    return messages.reverse();
  },
});

// Send a new message
export const send = mutation({
  args: {
    body: v.string(),
    author: v.string(),
  },
  handler: async (ctx, args) => {
    const message = {
      body: args.body,
      author: args.author,
      createdAt: Date.now(),
    };
    await ctx.db.insert("messages", message);
  },
});

