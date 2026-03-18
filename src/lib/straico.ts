export async function straicoGenerate(prompt: string) {
    const response = await fetch("https://api.straico.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRAICO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
      }),
    });
  
    const data = await response.json();
  
    return data?.choices?.[0]?.message?.content ?? "No response";
  }