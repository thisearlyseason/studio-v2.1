export async function straicoGenerate(prompt: string) {
  console.log("🔥 USING STRAICO");

  const response = await fetch("https://api.straico.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRAICO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  return data?.choices?.[0]?.message?.content;
}