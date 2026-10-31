(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        nav.classList.remove("is-open");
        toggle.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      }
    });
  }

  document.querySelectorAll("[data-lightbox]").forEach(function (figure) {
    figure.addEventListener("click", function () {
      var img = figure.querySelector("img");
      var box = document.querySelector(".lightbox");
      if (!img || !box) return;
      box.querySelector("img").src = img.src;
      box.querySelector("img").alt = img.alt;
      box.classList.add("is-open");
      document.body.style.overflow = "hidden";
    });
  });

  var lightbox = document.querySelector(".lightbox");
  if (lightbox) {
    lightbox.addEventListener("click", function () {
      lightbox.classList.remove("is-open");
      document.body.style.overflow = "";
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        lightbox.classList.remove("is-open");
        document.body.style.overflow = "";
      }
    });
  }

})();
