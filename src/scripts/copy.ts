// Copy buttons for code blocks. DOM APIs only: the CSP enforces Trusted Types
// with no policies, so any innerHTML-style sink would throw.
const blocks = document.querySelectorAll<HTMLPreElement>(".prose pre.astro-code");

if (blocks.length > 0 && navigator.clipboard) {
  const status = document.createElement("p");
  status.className = "visually-hidden";
  status.setAttribute("role", "status");
  document.body.append(status);

  for (const pre of blocks) {
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.before(wrapper);
    wrapper.append(pre);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy code");
    wrapper.append(button);

    let reset: number | undefined;
    button.addEventListener("click", async () => {
      // Diff signs sit in their own spans; leave them out of the copied text.
      const code = pre.cloneNode(true) as HTMLPreElement;
      code.querySelectorAll(".tk-mark").forEach((mark) => mark.remove());
      try {
        await navigator.clipboard.writeText(code.textContent ?? "");
        button.textContent = "Copied";
        status.textContent = "Code copied to the clipboard.";
      } catch {
        button.textContent = "Failed";
        status.textContent = "Copying failed. Select the code and copy it by hand.";
      }
      window.clearTimeout(reset);
      reset = window.setTimeout(() => {
        button.textContent = "Copy";
        status.textContent = "";
      }, 1600);
    });
  }
}
