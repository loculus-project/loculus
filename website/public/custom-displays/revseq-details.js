const hasValue = (value) =>
  value !== undefined && value !== null && value !== "" && value !== "N/A";

const formatValue = (value) => {
  if (!hasValue(value)) {
    return "Not available";
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString("en")
      : value.toFixed(2);
  }
  return value.toString();
};

const createElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className !== undefined) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
};

class RevseqQcStatus extends HTMLElement {
  connectedCallback() {
    const status = formatValue(this.textContent ?? "");
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `
            <style>
                :host {
                    display: inline-block;
                }

                .badge {
                    display: inline-flex;
                    min-height: 1.9rem;
                    align-items: center;
                    border-radius: 999px;
                    padding: 0.25rem 0.65rem;
                    font-size: 0.82rem;
                    font-weight: 700;
                }

                .badge.pass {
                    border: 1px solid #86efac;
                    background: #dcfce7;
                    color: #166534;
                }

                .badge.warn {
                    border: 1px solid #fde68a;
                    background: #fef3c7;
                    color: #92400e;
                }

                .badge.fail {
                    border: 1px solid #fecaca;
                    background: #fee2e2;
                    color: #991b1b;
                }

                .badge.unknown {
                    border: 1px solid #cbd5e1;
                    background: #f1f5f9;
                    color: #475569;
                }
            </style>
        `;

    root.append(createElement("span", `badge ${statusClass(status)}`, status));
  }
}

const statusClass = (status) => {
  const normalized = status.toLowerCase();
  if (["good", "pass", "passed"].includes(normalized)) {
    return "pass";
  }
  if (["mediocre", "warning", "warn"].includes(normalized)) {
    return "warn";
  }
  if (["bad", "failed", "fail"].includes(normalized)) {
    return "fail";
  }
  return "unknown";
};

customElements.define("revseq-qc-status", RevseqQcStatus);
