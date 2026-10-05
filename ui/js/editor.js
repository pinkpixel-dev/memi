import * as api from "./api.js";
import { $, clear, closeOnBackdrop, h } from "./dom.js";
import { icon } from "./icons.js";

const MAX = 8000;

function field(label, id, control, ...rest) {
  return h("div", { class: "field" }, h("label", { for: id }, label), control, ...rest);
}

const radio = (name, value, label, checked, onchange) =>
  h("label", {}, h("input", { type: "radio", name, value: String(value), checked, onchange }), label);

/**
 * Opens the side sheet to add a memory (memory = null) or edit one.
 * ctx: { categories, projects, currentProject, onSaved(result, isNew), onDelete(memory) }
 */
export function openEditor(ctx, memory) {
  const dlg = $("#editor");
  const isNew = !memory;
  const m = memory ?? {
    content: "",
    category: "context",
    importance: 3,
    tags: [],
    pinned: false,
    scope: ctx.currentProject ? "project" : "global",
    project: ctx.currentProject,
  };

  const content = h("textarea", { class: "textarea", id: "f-content", required: true, maxlength: MAX, rows: 7, value: m.content, placeholder: "What should be remembered?" });
  const category = h("input", { class: "input", id: "f-category", list: "f-categories", value: m.category, autocomplete: "off", spellcheck: "false", maxlength: 32, required: true });
  const tags = h("input", { class: "input", id: "f-tags", value: m.tags.join(", "), autocomplete: "off", spellcheck: "false", placeholder: "ci, deploy" });
  const project = h("input", { class: "input", id: "f-project", list: "f-projects", value: m.project ?? "", autocomplete: "off", spellcheck: "false", placeholder: "Project name" });
  const pinned = h("input", { type: "checkbox", id: "f-pinned", checked: m.pinned });
  const error = h("p", { class: "form-error", role: "alert", hidden: true });
  const save = h("button", { class: "btn btn-primary", type: "submit" }, isNew ? "Save" : "Save changes");

  const syncScope = () => {
    const isProject = form.elements.scope.value === "project";
    projectField.hidden = !isProject;
    project.required = isProject;
  };

  const projectField = h("div", { class: "field" }, h("label", { for: "f-project" }, "Project"), project);
  const form = h(
    "form",
    { class: "dialog-form" },
    h(
      "div",
      { class: "dialog-head" },
      h("h2", { id: "editor-title" }, isNew ? "New memory" : `Memory #${m.id}`),
      h("button", { class: "btn btn-icon", type: "button", title: "Close", "aria-label": "Close", onclick: () => dlg.close() }, icon("x")),
    ),
    h(
      "div",
      { class: "dialog-body" },
      field("Memory", "f-content", content),
      h(
        "div",
        { class: "field-row" },
        h("div", { class: "field" }, h("label", { for: "f-category" }, "Category"), category),
        h("div", { class: "field" }, h("span", { class: "label", id: "l-importance" }, "Importance"), h("div", { class: "segmented", role: "radiogroup", "aria-labelledby": "l-importance" }, ...[1, 2, 3, 4, 5].map((n) => radio("importance", n, String(n), m.importance === n)))),
      ),
      h(
        "div",
        { class: "field" },
        h("span", { class: "label", id: "l-scope" }, "Scope"),
        h("div", { class: "segmented", role: "radiogroup", "aria-labelledby": "l-scope" }, radio("scope", "global", "Global", m.scope === "global", syncScope), radio("scope", "project", "Project", m.scope === "project", syncScope)),
      ),
      projectField,
      field("Tags", "f-tags", tags),
      h("label", { class: "check-row", for: "f-pinned" }, pinned, "Pinned"),
      h("datalist", { id: "f-categories" }, ...ctx.categories.map((c) => h("option", { value: c.name }))),
      h("datalist", { id: "f-projects" }, ...ctx.projects.map((p) => h("option", { value: p.project }))),
      error,
      isNew ? null : h("p", { class: "fine" }, `Created ${new Date(m.createdAt).toLocaleString()}`, h("br"), `Updated ${new Date(m.updatedAt).toLocaleString()}`, m.agent ? ` by ${m.agent}` : ""),
    ),
    h(
      "div",
      { class: "dialog-foot" },
      isNew ? null : h("button", { class: "btn btn-danger", type: "button", onclick: () => ctx.onDelete(memory) }, icon("trash-2", 16), "Delete"),
      h("span", { class: "spacer" }),
      h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Cancel"),
      save,
    ),
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const isProject = form.elements.scope.value === "project";
    const body = {
      content: content.value,
      category: category.value,
      importance: Number(form.elements.importance.value),
      tags: tags.value.split(",").map((t) => t.trim()).filter(Boolean),
      pinned: pinned.checked,
      scope: isProject ? "project" : "global",
      project: isProject ? project.value.trim() : isNew ? undefined : null,
    };
    error.hidden = true;
    save.classList.add("loading");
    try {
      const result = isNew ? await api.addMemory(body) : await api.updateMemory(m.id, body);
      dlg.close();
      ctx.onSaved(result, isNew);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      save.classList.remove("loading");
    }
  });
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.requestSubmit();
  });

  closeOnBackdrop(dlg);

  clear(dlg).append(form);
  syncScope();
  // The viewer may already have the sheet open. Swapping its contents keeps the panel in place.
  if (!dlg.open) dlg.showModal();
  // On a phone, focusing an existing memory would raise the keyboard over the form. New memories always want typing.
  if (isNew || matchMedia("(pointer: fine)").matches) {
    content.focus();
    if (!isNew) content.setSelectionRange(0, 0);
  }
}
