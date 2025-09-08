# LangChain + OpenRouter (JS) Example

Below is a concise example using LangChain’s `ChatOpenAI` with OpenRouter, matching your stack. You can drop this into a Node/Next server context. Replace placeholders and set `OPENROUTER_API_KEY` in your env.

```ts
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const chat = new ChatOpenAI(
  {
    model: process.env.OPENROUTER_PLANNER_MODEL || "openai/gpt-4o-mini",
    temperature: 0.8,
    streaming: true,
    apiKey: process.env.OPENROUTER_API_KEY,
  },
  {
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "",
      "X-Title": process.env.OPENROUTER_SITE_TITLE || "",
    },
  }
);

// Example usage
const response = await chat.invoke([
  new SystemMessage("You are a helpful assistant."),
  new HumanMessage("Hello, how are you?"),
]);

console.log(response);
```

Tip: For tool-calling, pass a `tools` array in `.bind({ tools })` and instruct the model in the messages to respond with tool calls only when planning.

Environment variables used:

- `OPENROUTER_API_KEY`: your OpenRouter API key
- `OPENROUTER_PLANNER_MODEL` (optional): planner model, defaults to `openai/gpt-4o-mini`
- `OPENROUTER_SITE_URL` (optional): site URL for OpenRouter rankings
- `OPENROUTER_SITE_TITLE` (optional): site title for OpenRouter rankings

