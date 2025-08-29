export function logAction(action, user = "guest") {
  const timestamp = new Date().toLocaleString();
  const log = `[${timestamp}] (${user}) ${action}`;
  console.log(log);

  // Optional: Save to localStorage
  const logs = JSON.parse(localStorage.getItem("logs") || "[]");
  logs.push(log);
  localStorage.setItem("logs", JSON.stringify(logs));
}
