/**
 * KAFI AI Agents — unified agent switcher (all pages, one localhost)
 */
(function () {
  var AGENTS = [
    { id: "sales", label: "Agent 1 — International Sales Chatbot", href: "/index.html", paths: ["/", "/index.html"] },
    { id: "supply", label: "Agent 6 — Supply Chain", href: "/supply-chain.html", paths: ["/supply-chain.html"] },
    { id: "sourcing", label: "Sourcing & Procurement", href: "/sourcing.html", paths: ["/sourcing.html"] },
    { id: "warehouse", label: "Agent 8 — Warehouse & QC", href: "/warehouse-qc.html", paths: ["/warehouse-qc.html"] },
    { id: "security", label: "Agent 10 — Security Monitoring", href: "/security.html", paths: ["/security.html"] },
    { id: "admin", label: "Admin / Training", href: "/admin.html", paths: ["/admin.html"] },
  ];

  function currentPath() {
    var p = window.location.pathname || "/";
    if (p.endsWith("/") && p.length > 1) p = p.slice(0, -1);
    return p === "" ? "/" : p;
  }

  function activeAgent() {
    var path = currentPath();
    for (var i = 0; i < AGENTS.length; i++) {
      if (AGENTS[i].paths.indexOf(path) !== -1) return AGENTS[i];
    }
    return AGENTS[0];
  }

  function buildNav() {
    if (document.getElementById("kafi-app-nav")) return;

    var active = activeAgent();
    var nav = document.createElement("header");
    nav.id = "kafi-app-nav";
    nav.className = "kafi-app-nav";
    nav.setAttribute("role", "banner");

    var options = AGENTS.map(function (a) {
      var sel = a.id === active.id ? " selected" : "";
      return '<option value="' + a.href + '"' + sel + ">" + a.label + "</option>";
    }).join("");

    nav.innerHTML =
      '<div class="kafi-app-nav-inner">' +
      '<a href="/index.html" class="kafi-app-nav-brand">' +
      '<span class="kafi-app-nav-mark">K</span>' +
      "<span>KAFI AI Agents</span>" +
      "</a>" +
      '<span class="kafi-app-nav-label">Switch agent</span>' +
      '<div class="kafi-app-nav-select-wrap">' +
      '<select id="kafiAgentSelect" class="kafi-app-nav-select" aria-label="Select KAFI AI agent">' +
      options +
      "</select>" +
      '<span class="kafi-app-nav-status">' + (window.location.host || "localhost") + " · single workspace</span>" +
      "</div></div>";

    document.body.insertBefore(nav, document.body.firstChild);
    document.body.classList.add("kafi-has-nav");

    var select = document.getElementById("kafiAgentSelect");
    select.addEventListener("change", function () {
      if (select.value && select.value !== active.href && select.value !== currentPath()) {
        window.location.href = select.value;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildNav);
  } else {
    buildNav();
  }
})();
