(function () {
  var form = document.querySelector("#quote-form");
  if (!form) return;

  var grid = document.querySelector("#cal-grid");
  var label = document.querySelector("#cal-label");
  var times = document.querySelector("#time-grid");
  var timeNote = document.querySelector("#time-note");
  var status = document.querySelector("#book-status");
  var done = document.querySelector("#book-done");
  var summary = document.querySelector("#book-summary");
  var dateInput = form.elements.date;
  var timeInput = form.elements.time;
  var serviceInput = form.elements.service;
  var schedule = document.querySelector("#book-schedule");
  var submitButton = document.querySelector("#quote-submit");
  var intentButtons = document.querySelectorAll("[data-intent]");

  var view = new Date();
  var selectedDate = "";
  var selectedTime = "";
  var days = {};
  var mode = "quote";
  var scheduleLoaded = false;
  var monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  var preset = new URLSearchParams(window.location.search).get("service");
  if (preset && serviceInput) {
    Array.prototype.forEach.call(serviceInput.options, function (option) {
      if (option.value === preset || option.text === preset) serviceInput.value = option.value;
    });
  }

  function setStatus(message) {
    status.textContent = message || "";
  }

  function labelTime(stamp) {
    var parts = stamp.split(":");
    var hour = Number(parts[0]);
    var minute = parts[1];
    var suffix = hour >= 12 ? "p.m." : "a.m.";
    var hour12 = hour % 12 || 12;
    return hour12 + ":" + minute + " " + suffix;
  }

  function labelDate(iso) {
    var parts = iso.split("-");
    var day = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return day.toLocaleDateString("en-CA", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }

  function updateSummary() {
    var service = serviceInput.value;
    var bits = [];
    if (mode === "visit") bits.push("Site visit");
    else bits.push("Quote");
    if (service) bits.push(service);
    if (mode === "visit" && selectedDate) bits.push(labelDate(selectedDate));
    if (mode === "visit" && selectedTime) bits.push(labelTime(selectedTime));
    summary.textContent = bits.join(" · ");
  }

  function clearVisit() {
    selectedDate = "";
    selectedTime = "";
    dateInput.value = "";
    timeInput.value = "";
  }

  function setMode(next) {
    mode = next === "visit" ? "visit" : "quote";
    Array.prototype.forEach.call(intentButtons, function (button) {
      var on = button.getAttribute("data-intent") === mode;
      button.classList.toggle("is-selected", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    schedule.hidden = mode !== "visit";
    submitButton.textContent = mode === "visit" ? "Hold this visit" : "Send the request";
    if (mode !== "visit") clearVisit();
    setStatus("");
    if (mode === "visit") {
      if (!scheduleLoaded) loadMonth(true);
      else {
        renderCalendar();
        renderTimes();
      }
    }
    updateSummary();
  }

  function renderTimes() {
    times.innerHTML = "";
    var day = days[selectedDate];
    if (!selectedDate || !day) {
      timeNote.textContent = "Choose a day.";
      return;
    }
    if (!day.times.length) {
      timeNote.textContent = day.reason === "sunday"
        ? "Sundays are closed."
        : "That day has no open times.";
      return;
    }
    timeNote.textContent = "Edmonton time.";
    day.times.forEach(function (stamp) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "time-slot";
      button.textContent = labelTime(stamp);
      button.setAttribute("aria-pressed", stamp === selectedTime ? "true" : "false");
      if (stamp === selectedTime) button.classList.add("is-selected");
      button.addEventListener("click", function () {
        selectedTime = stamp;
        timeInput.value = stamp;
        setStatus("");
        renderTimes();
        updateSummary();
      });
      times.appendChild(button);
    });
  }

  function monthIndex(date) {
    return date.getFullYear() * 12 + date.getMonth();
  }

  function renderCalendar() {
    var year = view.getFullYear();
    var month = view.getMonth();
    var today = new Date();
    var min = new Date(today.getFullYear(), today.getMonth(), 1);
    var horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 90);
    var max = new Date(horizon.getFullYear(), horizon.getMonth(), 1);
    document.querySelector("[data-cal='prev']").disabled = monthIndex(view) <= monthIndex(min);
    document.querySelector("[data-cal='next']").disabled = monthIndex(view) >= monthIndex(max);
    label.textContent = monthNames[month] + " " + year;
    grid.innerHTML = "";
    var first = new Date(year, month, 1);
    var lead = (first.getDay() + 6) % 7;
    var count = new Date(year, month + 1, 0).getDate();
    for (var i = 0; i < lead; i += 1) {
      var blank = document.createElement("span");
      blank.className = "cal-blank";
      grid.appendChild(blank);
    }
    for (var dayNumber = 1; dayNumber <= count; dayNumber += 1) {
      var iso = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(dayNumber).padStart(2, "0");
      var info = days[iso];
      var button = document.createElement("button");
      button.type = "button";
      button.className = "cal-day";
      button.textContent = String(dayNumber);
      button.dataset.date = iso;
      var open = info && info.open;
      button.disabled = !open;
      if (!open) button.classList.add("is-closed");
      if (iso === selectedDate) {
        button.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.setAttribute("aria-pressed", "false");
      }
      button.setAttribute("aria-label", labelDate(iso) + (open ? ", open" : ", unavailable"));
      if (open) {
        button.addEventListener("click", function (event) {
          var iso = event.currentTarget.dataset.date;
          if (selectedDate === iso) {
            selectedDate = "";
            selectedTime = "";
            dateInput.value = "";
            timeInput.value = "";
          } else {
            selectedDate = iso;
            selectedTime = "";
            dateInput.value = selectedDate;
            timeInput.value = "";
          }
          setStatus("");
          renderCalendar();
          renderTimes();
          updateSummary();
        });
      }
      grid.appendChild(button);
    }
    renderTimes();
    updateSummary();
  }

  function loadMonth(advanceIfEmpty) {
    var year = view.getFullYear();
    var month = view.getMonth() + 1;
    setStatus("Loading the schedule…");
    fetch("/api/availability?year=" + year + "&month=" + month)
      .then(function (response) {
        if (!response.ok) throw new Error("schedule");
        return response.json();
      })
      .then(function (data) {
        var anyOpen = data.days.some(function (day) { return day.open; });
        if (advanceIfEmpty && !anyOpen) {
          var today = new Date();
          var horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 90);
          var next = new Date(year, month, 1);
          if (monthIndex(next) <= monthIndex(horizon)) {
            view = next;
            loadMonth(true);
            return;
          }
        }
        days = {};
        data.days.forEach(function (day) {
          days[day.date] = day;
        });
        if (selectedDate && (!days[selectedDate] || !days[selectedDate].open)) {
          selectedDate = "";
          selectedTime = "";
          dateInput.value = "";
          timeInput.value = "";
        }
        setStatus("");
        scheduleLoaded = true;
        renderCalendar();
      })
      .catch(function () {
        if (location.hostname.endsWith("github.io")) {
          setStatus("This preview can’t hold a time. Call 780-965-9595, or send the quote instead.");
          return;
        }
        setStatus("The schedule is unavailable right now. Call 780-965-9595.");
      });
  }

  document.querySelector("[data-cal='prev']").addEventListener("click", function () {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    loadMonth();
  });
  document.querySelector("[data-cal='next']").addEventListener("click", function () {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    loadMonth();
  });
  Array.prototype.forEach.call(intentButtons, function (button) {
    button.addEventListener("click", function () {
      setMode(button.getAttribute("data-intent"));
    });
  });
  serviceInput.addEventListener("change", updateSummary);

  function openQuoteEmail(visitLine) {
    var name = String(form.elements.name.value || "").trim();
    var phone = String(form.elements.phone.value || "").trim();
    var email = String(form.elements.email.value || "").trim();
    var property = String(form.elements.property.value || "").trim();
    var service = String(serviceInput.value || "").trim();
    var address = String(form.elements.address.value || "").trim();
    var details = String(form.elements.details.value || "").trim();
    var body = [
      (mode === "visit" ? "Site visit request" : "Quote request") + " from the Alta General Contracting website",
      "",
      "Name: " + name,
      "Phone: " + phone,
      "Email: " + email,
      "Property: " + property,
      "Service: " + service,
      "Address: " + address,
      "",
      details
    ];
    if (visitLine) body.push("", visitLine);
    var note = document.querySelector("#form-note");
    if (note && !visitLine) note.hidden = false;
    window.location.href =
      "mailto:info@altagc.ca?subject=" +
      encodeURIComponent((mode === "visit" ? "Site visit — " : "Quote request — ") + service) +
      "&body=" +
      encodeURIComponent(body.join("\n"));
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (mode === "quote") {
      setStatus("");
      openQuoteEmail("");
      return;
    }
    if (!selectedDate || !selectedTime) {
      setStatus("Choose a day and a time to hold the visit.");
      return;
    }
    var payload = {
      name: form.elements.name.value,
      phone: form.elements.phone.value,
      email: form.elements.email.value,
      property: form.elements.property.value,
      service: serviceInput.value,
      date: selectedDate,
      time: selectedTime,
      address: form.elements.address.value,
      notes: form.elements.details.value
    };
    setStatus("Holding that time…");
    fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.json().then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          setStatus(result.body.error || "That time could not be booked.");
          if (result.status === 409) loadMonth();
          return;
        }
        form.hidden = true;
        done.hidden = false;
        document.querySelector("#done-id").textContent = result.body.id;
        document.querySelector("#done-when").textContent =
          labelDate(result.body.date) + " at " + labelTime(result.body.time);
        document.querySelector("#done-service").textContent =
          result.body.service + " · " + result.body.property;
        document.querySelector("#done-address").textContent = result.body.address;
        setStatus("");
        openQuoteEmail(
          "Site visit held: " +
            result.body.id +
            " · " +
            labelDate(result.body.date) +
            " at " +
            labelTime(result.body.time)
        );
      })
      .catch(function () {
        setStatus("The booking did not go through. Call 780-965-9595.");
      });
  });

  var startVisit = new URLSearchParams(window.location.search).get("visit") === "1";
  if (startVisit) setMode("visit");
  else updateSummary();
})();
