"use strict";

// Evidence-led semantic reconstruction. Decisions use geometry, reliable text,
// canonical roles and parent context only; never fixture names or coordinates.
const clone = (value) => JSON.parse(JSON.stringify(value));
const textOf = (node) => String(node.text || node.label || "").trim();
const norm = (node) =>
  textOf(node)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const badText = (value) =>
  !value ||
  /^(button|account|description|continue|media region|product gallery|image here)(\s+\d+)?$/i.test(
    String(value).trim(),
  ) ||
  /^(?:q|ai|ms|keke|nagna)$/i.test(String(value).trim());
const actionWords =
  /\b(add to cart|buy|contact|start|get started|send|submit|save|sign in|log in)\b/i;
function unreliableText(node) {
  const cleaned = norm(node);
  if (
    ["about", "services", "contact", "home", "shop", "help"].includes(
      cleaned,
    ) &&
    node.role === "nav-link"
  )
    return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  const localOnly = !node.source?.vision;
  const weak = (+node.confidence || 0) < 0.62;
  return (
    node.type === "text" &&
    localOnly &&
    weak &&
    (words.length < 3 ||
      [
        "heading",
        "hero-heading",
        "section-heading",
        "product-title",
        "rating",
        "nav-link",
      ].includes(node.role))
  );
}

function walk(node, parent = null, out = []) {
  if (node.type !== "root") out.push({ node, parent });
  (node.children || []).forEach((child) => walk(child, node, out));
  return out;
}
function boundsOf(node) {
  const b = node.relativeBounds || node.bboxNorm || {};
  return {
    x: +b.x || 0,
    y: +b.y || 0,
    width: +b.width || 0,
    height: +b.height || 0,
  };
}
function candidateRoles(node, parent) {
  const label = norm(node),
    b = boundsOf(node),
    roles = [];
  const add = (role, score, why) =>
    roles.push({ role, score: Math.max(0, Math.min(1, score)), why });
  if (node.role)
    add(
      node.role,
      0.76 + Math.min(0.18, +(node.confidence || 0) * 0.18),
      "canonical role evidence",
    );
  if ((node.role === "logo" || /\blogo\b/.test(label)) && b.y < 0.22)
    add("brand", 0.92, "short top-band brand marker");
  if (node.role === "nav-link" && parent?.role === "nav-group")
    add("nav-item", 0.93, "header peer navigation");
  if (node.type === "button" && actionWords.test(label))
    add("action", 0.8, "action vocabulary and control geometry");
  if (node.type === "input")
    add(
      node.role === "search" || /search/.test(label) ? "search" : "input",
      0.88,
      "field geometry",
    );
  if (node.type === "image" || node.role === "media")
    add("media", 0.79, "media rectangle evidence");
  if (/price|\$|�,1|�,�/.test(label)) add("price", 0.9, "price vocabulary");
  if (/rating|review/.test(label)) add("rating", 0.83, "rating vocabulary");
  if (node.role === "thumbnail-gallery")
    add("thumbnail-gallery", 0.92, "repeated thumbnail geometry");
  if (node.role === "product-detail")
    add("product-detail", 0.95, "product region evidence");
  if (node.role === "feature-card-grid" || node.role === "product-card-grid")
    add("card-grid", 0.93, "repeated equal geometry");
  if (node.role === "map-region")
    add("map-region", 0.9, "large lower location region");
  if (!roles.length)
    add("generic-region", 0.35, "insufficient semantic evidence");
  return roles.sort((a, b) => b.score - a.score);
}
function normalizeEvidence(schema) {
  return {
    version: 1,
    coordinateSystem: "normalized-0-1",
    image: schema.relativeBounds || null,
    items: walk(schema).map(({ node, parent }) => ({
      evidenceId: node.id,
      sourceNodeId: node.id,
      type: node.type,
      canonicalRole: node.role || null,
      text: badText(textOf(node)) ? null : textOf(node),
      bounds: boundsOf(node),
      confidence: +node.confidence || 0,
      provenance: node.source || {},
      parentEvidenceId: parent?.id || null,
    })),
  };
}
function mergeAdjacentText(node) {
  const textNodes = (node.children || []).filter(
    (c) => c.type === "text" && !badText(textOf(c)),
  );
  for (const current of textNodes) {
    const b = boundsOf(current);
    const peers = textNodes.filter(
      (other) =>
        other !== current &&
        Math.abs(boundsOf(other).y - b.y) < Math.max(0.018, b.height * 0.9),
    );
    if (
      peers.length === 1 &&
      ["copy", "description", "paragraph"].includes(current.role) &&
      ["copy", "description", "paragraph"].includes(peers[0].role)
    ) {
      const other = peers[0];
      if (current.id > other.id) continue;
      current.text = `${textOf(current)} ${textOf(other)}`
        .replace(/\s+/g, " ")
        .trim();
      node.children = node.children.filter((c) => c !== other);
    }
  }
  (node.children || []).forEach(mergeAdjacentText);
}
function sanitize(node, removed = []) {
  node.children = (node.children || [])
    .map((child) => sanitize(child, removed))
    .filter(Boolean);
  const label = textOf(node);
  if (
    (badText(label) || unreliableText(node)) &&
    ["text", "button", "link"].includes(node.type) &&
    node.role !== "logo"
  ) {
    removed.push({
      nodeId: node.id,
      reason: "low-context OCR or invented visible label",
    });
    return null;
  }
  if (
    ["heading", "hero-heading", "section-heading", "product-title"].includes(
      node.role,
    ) &&
    badText(label)
  ) {
    removed.push({ nodeId: node.id, reason: "empty or unreliable heading" });
    return null;
  }
  if (/contact us|get in touch/.test(norm(node)) && node.type === "button") {
    node.type = "text";
    node.role = "section-heading";
  }
  if (/\blogo\b/.test(norm(node)) || node.role === "logo") node.role = "brand";
  if (/^(\[\s*\]\s*)?(send|submit)$/i.test(label)) {
    node.role = "submit-action";
    node.text = label.replace(/^\[\s*\]\s*/, "");
    node.label = node.text;
  }
  return node;
}
function normalizeHeader(root, decisions) {
  for (const { node } of walk(root))
    if (node.role === "header") {
      for (const { node: brand, parent } of walk(node))
        if (brand.role === "brand" && parent && parent !== node) {
          parent.children = parent.children.filter((c) => c !== brand);
          node.children.unshift(brand);
          decisions.push({
            nodeId: brand.id,
            reason: "brand elevated to header sibling",
          });
        }
      // Collect nav link texts to detect phantom merged buttons
      const navLinks = [];
      for (const { node: n } of walk(node))
        if (n.role === "nav-link") navLinks.push(norm(n));
      const seen = new Set();
      node.children = (node.children || []).filter((child) => {
        // Remove buttons whose text is a merge of multiple nav links
        if (child.type === "button" && navLinks.length >= 2) {
          const childNorm = norm(child);
          const matchCount = navLinks.filter(nl => childNorm.includes(nl)).length;
          if (matchCount >= 2) {
            decisions.push({
              nodeId: child.id,
              reason: "phantom merged nav button removed",
            });
            return false;
          }
        }
        if (child.type !== "button" || !actionWords.test(textOf(child)))
          return true;
        const key = norm(child);
        if (seen.has(key)) {
          decisions.push({
            nodeId: child.id,
            reason: "duplicate header action removed",
          });
          return false;
        }
        seen.add(key);
        return true;
      });
      // Remove garbage OCR fragments from nav groups
      for (const { node: navGroup } of walk(node))
        if (navGroup.role === "nav-group") {
          navGroup.children = (navGroup.children || []).filter((child) => {
            const t = norm(child);
            if (child.type === "text" && t.length <= 5 && !["about","home","shop","help"].includes(t) && child.role === "nav-link") {
              const isKnown = navLinks.some(nl => nl === t);
              if (!isKnown) {
                decisions.push({ nodeId: child.id, reason: "garbage OCR nav fragment removed" });
                return false;
              }
            }
            return true;
          });
        }
    }
}
function formAndProductPass(root, decisions, pageFamily) {
  if (pageFamily && pageFamily.selected === "authentication") return;
  for (const { node } of walk(root))
    if (node.role === "contact-section") {
      const hasForm = (node.children || []).some((c) => c.role === "form" || c.role === "auth-form");
      if (!hasForm) {
        const inputs = (node.children || []).filter((c) => c.type === "input");
        const submits = (node.children || []).filter(
          (c) => c.role === "submit-action",
        );
        if (inputs.length && submits.length) {
          const form = {
            id: `form-${node.id}`,
            type: "region",
            role: "form",
            confidence: 0.75,
            source: { semantic: true },
            relativeBounds: boundsOf(node),
            layout: { direction: "column", gap: 12 },
            children: [...inputs, ...submits],
          };
          node.children = node.children.filter(
            (c) => !inputs.includes(c) && !submits.includes(c),
          );
          node.children.push(form);
          decisions.push({
            nodeId: form.id,
            reason: "form inferred from field and submit evidence",
          });
        }
      }
    }
  for (const { node, parent } of walk(root))
    if (node.role === "submit-action" && parent?.role !== "form" && parent?.role !== "auth-form") {
      node.role = "action";
      node.type = "button";
      decisions.push({
        nodeId: node.id,
        reason: "submit-downgraded-no-form-evidence",
      });
    }
}
function dedupe(root, decisions) {
  for (const { node } of walk(root)) {
    const seen = new Map();
    node.children = (node.children || []).filter((child) => {
      const key = `${child.role || child.type}:${norm(child)}`;
      if (!norm(child) || !seen.has(key)) {
        seen.set(key, child);
        return true;
      }
      const keep = seen.get(key);
      if ((child.confidence || 0) > (keep.confidence || 0)) {
        seen.set(key, child);
        decisions.push({
          nodeId: keep.id,
          reason: "duplicate semantic peer removed",
          retainedNodeId: child.id,
        });
        return false;
      }
      decisions.push({
        nodeId: child.id,
        reason: "duplicate semantic peer removed",
        retainedNodeId: keep.id,
      });
      return false;
    });
  }
}
function semanticType(node) {
  const r = node.role;
  if (r === "page") return "AppShell";
  if (r === "header") return "Header";
  if (r === "brand") return "Brand";
  if (r === "nav-group") return "Nav";
  if (r === "nav-link") return "NavItem";
  if (r === "main") return "Main";
  if (r === "form") return "ContactForm";
  if (r === "auth-form") return "AuthForm";
  if (r === "auth-password") return "PasswordInput";
  if (r === "auth-primary-action") return "AuthSubmit";
  if (r === "auth-helper") return "AuthHelper";
  if (r === "gallery") return "ProductGallery";
  if (r === "product-detail") return "ProductDetail";
  if (r === "thumbnail-gallery") return "ThumbnailList";
  if (r === "cart-action") return "CartAction";
  if (r === "feature-card-grid" || r === "product-card-grid") return "CardGrid";
  if (r === "feature-card" || r === "product-card") return "Card";
  if (r === "map-region") return "MapRegion";
  if (node.type === "image" || r === "media") return "MediaPlaceholder";
  if (node.type === "input") return r === "search" ? "Search" : "TextInput";
  if (r === "submit-action") return "SubmitButton";
  if (node.type === "button") return "Action";
  if (node.type === "text")
    return r === "brand"
      ? "Brand"
      : [
            "heading",
            "hero-heading",
            "section-heading",
            "product-title",
          ].includes(r)
        ? "Heading"
        : "Paragraph";
  return "GenericRegion";
}
function sectionTarget(role) {
  return (
    {
      page: "top",
      "hero-section": "hero",
      "services-section": "services",
      "about-section": "about",
      "contact-section": "contact",
      "related-products": "shop",
      "help-section": "help",
      footer: "help",
    }[role] || null
  );
}
function resolveInteractions(root, decisions) {
  const available = new Set(["top"]);
  for (const { node } of walk(root)) {
    const id = sectionTarget(node.role);
    if (id) {
      available.add(id);
      node.domId = id;
    }
  }
  const list = [];
  for (const { node, parent } of walk(root)) {
    const label = norm(node);
    let target = null;
    if (
      node.role === "nav-link" ||
      (node.type === "button" &&
        /contact|get started|about|services|shop|help|home/.test(label))
    ) {
      const intent = label.includes("home")
        ? "top"
        : label.includes("about")
          ? "about"
          : label.includes("service")
            ? "services"
            : label.includes("contact") || label.includes("start")
              ? "contact"
              : label.includes("shop")
                ? "shop"
                : label.includes("help")
                  ? "help"
                  : null;
      if (intent && available.has(intent)) {
        target = intent;
        node.resolvedTarget = target;
        list.push({
          sourceComponentId: node.id,
          type: "scroll",
          target,
          state: null,
          local: true,
          accessibility: ["keyboard-focus"],
          confidence: node.confidence || 0,
          fallback: "no-op if target absent",
        });
      } else if (node.role === "nav-link") {
        node.role = "nav-text";
        node.resolvedTarget = null;
        decisions.push({
          nodeId: node.id,
          reason: "navigation downgraded because target is absent",
        });
      }
    } else if (node.role === "submit-action")
      list.push({
        sourceComponentId: node.id,
        type: "form-submit",
        target: parent?.id || null,
        state: ["formData", "submitted"],
        local: true,
        accessibility: ["native-submit", "status-message"],
        confidence: node.confidence || 0,
        fallback: "prevent default",
      });
    else if (node.role === "cart-action")
      list.push({
        sourceComponentId: node.id,
        type: "toggle-cart",
        target: "cart-summary",
        state: ["cartOpen", "cartCount"],
        local: true,
        accessibility: ["button", "aria-expanded"],
        confidence: node.confidence || 0,
        fallback: "toggle local summary",
      });
    else if (/add to cart/.test(label))
      list.push({
        sourceComponentId: node.id,
        type: "add-to-cart",
        target: "cart-summary",
        state: ["cartCount"],
        local: true,
        accessibility: ["button", "live-count"],
        confidence: node.confidence || 0,
        fallback: "increment local cart",
      });
    else if (node.type === "input" && node.role === "search")
      list.push({
        sourceComponentId: node.id,
        type: "search-input",
        target: null,
        state: ["searchQuery"],
        local: true,
        accessibility: ["searchbox"],
        confidence: node.confidence || 0,
        fallback: "local value only",
      });
  }
  return { availableTargets: [...available], interactions: list };
}
function ownershipMap(root) {
  const macro = new Set([
    "header",
    "hero-section",
    "services-section",
    "split-content-section",
    "about-section",
    "contact-section",
    "gallery",
    "product-detail",
    "related-products",
    "sidebar",
    "metric-grid",
    "data-table",
    "form",
  ]);
  const rows = [];
  function visit(node, owner) {
    const current = macro.has(node.role) ? node.id : owner;
    if (node.type !== "root")
      rows.push({
        sourceNodeId: node.id,
        selectedComponentId: `semantic-${node.id}`,
        ownerComponentId: current || node.id,
        role: node.role || node.type,
        dropped: false,
      });
    (node.children || []).forEach((child) => visit(child, current));
  }
  visit(root, null);
  return {
    valid: rows.every((row) => Boolean(row.ownerComponentId)),
    assignments: rows,
  };
}
function layoutPlan(root) {
  const bands = [];
  for (const { node } of walk(root))
    if (
      [
        "header",
        "hero-section",
        "services-section",
        "split-content-section",
        "about-section",
        "contact-section",
        "gallery",
        "product-detail",
        "related-products",
        "sidebar",
      ].includes(node.role)
    ) {
      const b = boundsOf(node);
      bands.push({
        componentId: node.id,
        role: node.role,
        yStart: b.y,
        yEnd: b.y + b.height,
        xStart: b.x,
        xEnd: b.x + b.width,
        confidence: node.confidence || 0,
        headingAnchors: (node.children || [])
          .filter((x) =>
            [
              "heading",
              "hero-heading",
              "section-heading",
              "product-title",
            ].includes(x.role),
          )
          .map((x) => x.id),
      });
    }
  return {
    coordinateSystem: "normalized-0-1",
    bands: bands.sort((a, b) => a.yStart - b.yStart),
  };
}
function manifest(interactions) {
  const state = new Set(),
    handlers = new Set(),
    targets = new Set();
  for (const x of interactions) {
    (x.state || []).forEach((y) => state.add(y));
    if (x.type === "form-submit") handlers.add("handleSubmit");
    if (x.type === "add-to-cart") handlers.add("handleAddToCart");
    if (x.type === "toggle-cart") handlers.add("toggleCart");
    if (x.type === "search-input") handlers.add("handleSearch");
    if (x.target) targets.add(x.target);
  }
  return {
    hooks: state.size ? ["useState"] : [],
    state: [...state],
    handlers: [...handlers],
    targets: [...targets],
  };
}
function pageFamilyHypotheses(root) {
  const nodes = walk(root).map((x) => x.node),
    words = nodes.map(norm).join(" ");
  const score = {
    landing: 0,
    "ecommerce-product": 0,
    "ecommerce-catalog": 0,
    authentication: 0,
    dashboard: 0,
    article: 0,
    profile: 0,
    generic: 0.15,
  };
  const count = (pattern) => (words.match(pattern) || []).length;
  score.authentication +=
    count(/\b(login|sign in|password|forgot|register|registration|email)\b/) *
      0.22 +
    Math.min(0.25, nodes.filter((x) => x.type === "input").length * 0.1);
  score["ecommerce-product"] +=
    count(/\b(price|review|rating|cart|add to cart|variant|quantity)\b/) *
      0.18 +
    (nodes.some((x) => x.role === "gallery") ? 0.2 : 0) +
    (nodes.some((x) => x.role === "product-detail") ? 0.3 : 0);
  score.landing +=
    count(/\b(services|about|contact|get started|features)\b/) * 0.12 +
    (nodes.some((x) => x.role === "hero-section") ? 0.25 : 0) +
    (nodes.some((x) => x.role === "feature-card-grid") ? 0.2 : 0);
  score.dashboard +=
    count(/\b(metric|revenue|dashboard|table|filter)\b/) * 0.2 +
    (nodes.some((x) => x.role === "sidebar") ? 0.3 : 0);
  const hypotheses = Object.entries(score)
    .map(([family, value]) => ({
      family,
      score: Number(Math.min(0.99, value).toFixed(2)),
      evidence:
        "text vocabulary, field/media geometry and selected macro roles",
    }))
    .sort((a, b) => b.score - a.score);
  return {
    selected: hypotheses[0].score >= 0.42 ? hypotheses[0].family : "generic",
    confidence: hypotheses[0].score,
    hypotheses,
  };
}
function applyAuthModel(root, family, decisions) {
  if (family.selected !== "authentication") return null;
  const entries = walk(root),
    inputs = entries.filter((x) => x.node.type === "input"),
    labels = entries.filter(
      (x) =>
        x.node.type === "text" &&
        /login|email|username|password/i.test(textOf(x.node)),
    );
  if (!inputs.length || !labels.length) return null;
  const host =
    inputs[0].parent ||
    entries.find((x) => x.node.role === "main")?.node ||
    root;
  const fields = [];
  for (const item of inputs) {
    const b = boundsOf(item.node);
    const nearest = labels
      .map((x) => ({ node: x.node, d: Math.abs(boundsOf(x.node).y - b.y) }))
      .sort((a, b) => a.d - b.d)[0];
    const label = nearest && nearest.d < 0.09 ? textOf(nearest.node) : "Field";
    const password = /password/i.test(label);
    item.node.role = password ? "auth-password" : "auth-field";
    item.node.label = label;
    fields.push({
      id: password ? "password" : "emailOrUsername",
      label,
      type: password ? "password" : "text",
      required: true,
      bounds: b,
    });
    if (nearest) {
      const parent = entries.find((x) =>
        x.node.children?.includes(nearest.node),
      )?.node;
      if (parent)
        parent.children = parent.children.filter((x) => x !== nearest.node);
    }
  }
  const buttons = entries.filter((x) => x.node.type === "button");
  const primary = buttons.find((x) => /login|sign in/i.test(textOf(x.node)));
  if (!primary) return null;
  primary.node.role = "auth-primary-action";
  const helpers = buttons.filter(
    (x) =>
      x.node !== primary.node &&
      /facebook|forgot|register/i.test(textOf(x.node)),
  );
  helpers.forEach((x) => (x.node.role = "auth-helper"));
  const formChildren = [
      ...inputs.map((x) => x.node),
      primary.node,
      ...helpers.map((x) => x.node),
  ];
  
  // Remove from actual parents
  formChildren.forEach(child => {
      const parent = entries.find(x => x.node.children && x.node.children.includes(child))?.node;
      if (parent) {
          parent.children = parent.children.filter(x => x !== child);
      }
  });

  const form = {
    id: `auth-form-${host.id}`,
    type: "region",
    role: "auth-form",
    confidence: family.confidence,
    relativeBounds: boundsOf(host),
    source: { semantic: true },
    layout: { direction: "column", gap: 12 },
    children: formChildren,
  };
  
  host.children = (host.children || []).filter(
    (x) => !form.children.includes(x),
  );
  host.children.push(form);
  decisions.push({
    nodeId: form.id,
    reason: "authentication form selected from field and login evidence",
  });
  return {
    component: "AuthForm",
    mode: "login",
    fields,
    primaryAction: { label: textOf(primary.node), type: "submit" },
    secondaryActions: helpers.map((x) => ({
      label: textOf(x.node),
      kind: /facebook/i.test(textOf(x.node))
        ? "social-login"
        : /forgot/i.test(textOf(x.node))
          ? "forgot-password"
          : "registration",
    })),
  };
}
function buildSemanticUiPlan(canonicalSchema, options = {}) {
  const rawEvidence = {
    version: 1,
    schemaSource: canonicalSchema.provenance?.schemaSource || "unknown",
    nodes: walk(canonicalSchema).map(({ node }) => ({
      id: node.id,
      type: node.type,
      role: node.role || null,
      text: textOf(node) || null,
      bounds: node.relativeBounds || node.bboxNorm || null,
      confidence: node.confidence || 0,
      source: node.source || {},
    })),
  };
  const normalizedEvidence = normalizeEvidence(canonicalSchema);
  const styleEvidence = options.styleEvidence || {
    source: "neutral-fallback",
    themeTokenPlan: {
      mode: "light",
      colors: {
        background: "#ffffff",
        surface: "#f8fafc",
        text: "#1f2937",
        mutedText: "#64748b",
        primary: "#2563eb",
        primaryContrast: "#ffffff",
        border: "#d1d5db",
      },
      radius: { sm: "8px", md: "12px", lg: "18px" },
      spacing: { section: "72px", content: "24px", grid: "24px" },
      typography: {
        headingFont: "system-ui",
        bodyFont: "system-ui",
        heroScale: "clamp(2.25rem, 5vw, 4.5rem)",
      },
    },
  };
  const semanticCandidates = walk(canonicalSchema).map(({ node, parent }) => ({
    candidateId: `candidate-${node.id}`,
    sourceEvidenceIds: [node.id],
    bounds: boundsOf(node),
    possibleRoles: candidateRoles(node, parent),
    parentCandidateId: parent ? `candidate-${parent.id}` : null,
    confidence: node.confidence || 0,
    conflicts: [],
    explanation: "geometry, text quality, role and parent-context scoring",
  }));
  const removed = [];
  const selectedComponentTree = sanitize(clone(canonicalSchema), removed);
  mergeAdjacentText(selectedComponentTree);
  const semanticDecisions = [];
  normalizeHeader(selectedComponentTree, semanticDecisions);
  const pageFamily = pageFamilyHypotheses(selectedComponentTree);
  formAndProductPass(selectedComponentTree, semanticDecisions, pageFamily);
  dedupe(selectedComponentTree, semanticDecisions);
  const authModel = applyAuthModel(
    selectedComponentTree,
    pageFamily,
    semanticDecisions,
  );
  const componentDataModels = authModel ? [authModel] : [];
  const resolved = resolveInteractions(
    selectedComponentTree,
    semanticDecisions,
  );
  const interactionGraph = resolved.interactions;
  const dependencyManifest = manifest(interactionGraph);
  if (authModel) {
    dependencyManifest.hooks = ["useState"];
    dependencyManifest.state = [
      "authEmailOrUsername",
      "authPassword",
      "authSubmitted",
      "authStatus",
    ];
    dependencyManifest.handlers = ["handleAuthSubmit", "handleAuthHelper"];
  }
  const componentOwnershipMap = ownershipMap(selectedComponentTree);
  const layout = layoutPlan(selectedComponentTree);
  const components = walk(selectedComponentTree).map(({ node }) => {
    node.semanticComponentId = `semantic-${node.id}`;
    return {
      id: node.id,
      component: semanticType(node),
      role: node.role || "generic-region",
      bounds: boundsOf(node),
      sourceNodeIds: [node.id],
    };
  });
  const themeTokenPlan = styleEvidence.themeTokenPlan;
  const responsiveLayoutPlan = {
    ...layout,
    maxWidth: themeTokenPlan.layout?.maxWidth || "1200px",
    mobile: "stack columns below 768px",
    tokens: themeTokenPlan.spacing,
  };
  const codegenTree = {
    version: 2,
    kind: "CodegenTree",
    root: selectedComponentTree,
    interactionGraph,
    dependencyManifest,
    componentOwnershipMap,
    layoutPlan: responsiveLayoutPlan,
    themeTokenPlan,
    componentDataModels,
    components,
  };
  return {
    version: 5,
    rawEvidence,
    normalizedEvidence,
    styleEvidence,
    regionGraph: layout,
    pageFamilyHypotheses: pageFamily,
    semanticCandidates,
    selectedComponentTree,
    componentDataModels,
    componentOwnershipMap,
    resolvedInteractionGraph: {
      availableTargets: resolved.availableTargets,
      interactions: interactionGraph,
    },
    interactionGraph,
    interactionStatePlan: {
      interactions: interactionGraph,
      dependencyManifest,
    },
    themeTokenPlan,
    responsiveLayoutPlan,
    layoutPlan: responsiveLayoutPlan,
    codegenTree,
    dependencyManifest,
    removedNodes: removed,
    semanticDecisions,
    components,
    interactionPlan: interactionGraph,
    codegenSchema: selectedComponentTree,
  };
}
module.exports = { buildSemanticUiPlan, badText };