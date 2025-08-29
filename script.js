// Firebase references
let currentUserLocation = null;
const auth = firebase.auth();
const db = firebase.firestore();

// DOM references
const authSection = document.getElementById("auth-section");
const userSection = document.getElementById("user-section");
const eventsSection = document.getElementById("events-section");

const adminEmail = "devshukal@gmail.com";

// Modified Add City/Area with OpenStreetMap Geocoding 
async function geocodeCityArea(city, area) {
  const address = encodeURIComponent(`${area}, ${city}`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${address}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'sports-buddy-app/1.0 (udaysinghgurjar528@gmail.com)'
    }
  });

  const data = await res.json();

  if (data.length > 0) {
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    return new firebase.firestore.GeoPoint(lat, lng);
  } else {
    throw new Error("Geocoding failed: location not found.");
  }
}

async function getCityAreaGeoPoint(city, area) {
  const query = await db.collection("cities")
    .where("city", "==", city)
    .where("area", "==", area)
    .limit(1)
    .get();
  if (!query.empty) {
    return query.docs[0].data().location;
  } else {
    throw new Error("Location not found for selected city and area.");
  }
}

window.previewLocation = async () => {
  const city = document.getElementById("eventCity").value.trim();
  const area = document.getElementById("eventArea").value.trim();
  if (!city || !area) {
    alert("Please fill both City and Area to preview location.");
    return;
  }
  try {
    const geo = await getCityAreaGeoPoint(city, area);
    const lat = geo.latitude;
    const lng = geo.longitude;
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
  } catch (err) {
    alert("Location preview failed: " + err.message);
  }
};

function attachNavListeners() {
  document.getElementById("loginBtn")?.addEventListener("click", () => loadForm("login"));
  document.getElementById("registerBtn")?.addEventListener("click", () => loadForm("register"));
}

async function loadForm(type) {
  const res = await fetch(`auth/${type}.html`);
  const html = await res.text();
  authSection.innerHTML = html;
  document.getElementById("tagline")?.classList.add("hidden");
  attachFormHandlers(type);
  const tagline = document.getElementById("tagline");
  if (tagline) tagline.classList.add("hidden");
}

function attachFormHandlers(type) {
  if (type === "login") {
    document.getElementById("login-submit").addEventListener("click", async () => {
      const email = document.getElementById("login-email").value;
      const password = document.getElementById("login-password").value;
      try {
        await auth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        document.getElementById("login-error").innerText = err.message;
      }
    });
  }

  if (type === "register") {
    document.getElementById("register-submit").addEventListener("click", async () => {
      const email = document.getElementById("register-email").value;
      const password = document.getElementById("register-password").value;
      try {
        await auth.createUserWithEmailAndPassword(email, password);
        await auth.currentUser.updateProfile({
          displayName: email.split("@")[0],
          photoURL: "https://api.dicebear.com/7.x/initials/svg?seed=" + email
        });
      } catch (err) {
        document.getElementById("register-error").innerText = err.message;
      }
    });
  }

  document.getElementById("cancel-auth")?.addEventListener("click", () => {
    document.getElementById("auth-section").innerHTML = "";
    document.getElementById("tagline")?.classList.remove("hidden");
  });
}

// --- Auth state change handler ---
auth.onAuthStateChanged(async (user) => {
  if (user) {
    // Show/hide navbar elements
    document.getElementById("nav-auth-buttons").style.display = "none";
    document.getElementById("nav-profile").style.display = "flex";
    document.getElementById("nav-profile-pic").src = user.photoURL || "https://www.gravatar.com/avatar?d=mp";

    const fullName = user.displayName || "User";
    const nameParts = fullName.split(" ");
    document.getElementById("nav-user-name").textContent = nameParts.join(" ");
    document.getElementById("nav-user-email").textContent = user.email;
    const prefBtn = document.getElementById("changePreferencesBtn");
    if (prefBtn) {
      if (user.email === adminEmail) {
        prefBtn.style.display = "none";
      } else {
        prefBtn.style.display = "block"; // Show it again for normal users
      }
    }


    authSection.innerHTML = "";
    userSection.innerHTML = "";
    eventsSection.style.display = "none";

    await populateFilters();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          currentUserLocation = new firebase.firestore.GeoPoint(latitude, longitude);
          await db.collection("users").doc(user.uid).set({ location: currentUserLocation }, { merge: true });

          const userDoc = await db.collection("users").doc(user.uid).get();
          const userData = userDoc.data();

          if (!userData?.fullName && user.email !== adminEmail) {
            const nameRes = await fetch("user/Name.html");
            const nameHtml = await nameRes.text();
            userSection.innerHTML = nameHtml;

            document.getElementById("nameForm").addEventListener("submit", async (e) => {
              e.preventDefault();
              const fullName = document.getElementById("fullName").value.trim();
              if (!fullName) return alert("Please enter your name");
              await db.collection("users").doc(user.uid).set({ fullName }, { merge: true });
              user.displayName = fullName;
              userSection.innerHTML = "";
              location.reload();
            });
            return;
          }

          if (user.email === adminEmail) {
            // Admin panel logic
            if (!document.getElementById("admin-panel")) {
              const adminPanel = document.createElement("section");
              adminPanel.id = "admin-panel";
              authSection.appendChild(adminPanel);

              const res = await fetch("admin/dashboard.html");
              const html = await res.text();
              adminPanel.innerHTML = html;
              window.showSection = function (type) {
                document.getElementById("eventSection")?.classList.add("hidden");
                document.getElementById("sportsSection")?.classList.add("hidden");
                document.getElementById("citiesSection")?.classList.add("hidden");

                if (type === 'event') document.getElementById("eventSection")?.classList.remove("hidden");
                if (type === 'sports') {
                  document.getElementById("sportsSection")?.classList.remove("hidden");
                  loadSports();
                }
                if (type === 'cities') {
                  document.getElementById("citiesSection")?.classList.remove("hidden");
                  loadCities();
                }
              };

              // ✅ Then call attachAdminTabHandlers
              attachAdminTabHandlers(user);
            }
            eventsSection.style.display = "block";
            loadAdminEvents();

          } else if (!userData?.interests || !userData?.skillLevel) {
            // Normal user without preferences
            const res = await fetch("user/Preferences.html");
            const html = await res.text();
            userSection.innerHTML = html;
            eventsSection.style.display = "none";

            document.getElementById("preferencesForm").addEventListener("submit", async (e) => {
              e.preventDefault();
              const selectedSports = [...document.querySelectorAll("input[name='sports']:checked")].map(cb => cb.value);
              const skillLevel = document.querySelector("input[name='skill']:checked")?.value;

              if (selectedSports.length === 0 || !skillLevel) {
                document.getElementById("prefStatus").innerText = " Please select at least one sport and skill level.";
                return;
              }

              await db.collection("users").doc(user.uid).set({
                interests: selectedSports,
                skillLevel: skillLevel
              }, { merge: true });

              document.getElementById("prefStatus").innerText = " Preferences saved!";
              setTimeout(() => {
                userSection.innerHTML = "";
                eventsSection.style.display = "block";
                loadUserEvents();
              }, 800);
            });

            document.getElementById("skipPreferences").addEventListener("click", () => {
              userSection.innerHTML = "";
              eventsSection.style.display = "block";
              loadUserEvents();
            });

          } else {
            eventsSection.style.display = "block";
            loadUserEvents();
          }

        },
        (error) => {
          console.warn(" Location permission denied:", error.message);
          alert("Location access is required to show nearby events.");
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }

    // Profile menu toggle
    const menuToggle = document.getElementById("menuToggle");
    const profileMenu = document.getElementById("profileMenu");
    menuToggle.onclick = () => {
      profileMenu.classList.toggle("hidden");
      if (auth.currentUser?.email === adminEmail) {
        const prefBtn = document.getElementById("changePreferencesBtn");
        if (prefBtn) prefBtn.style.display = "none";
      }
      const prefBtn = document.getElementById("changePreferencesBtn");
      if (prefBtn && !prefBtn.dataset.listenerAttached) {
        prefBtn.dataset.listenerAttached = "true"; 
        prefBtn.addEventListener("click", async () => {
          const res = await fetch("user/Preferences.html");
          const html = await res.text();
          document.getElementById("user-section").innerHTML = html;
          document.getElementById("events-section").style.display = "none";

          document.getElementById("preferencesForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const selectedSports = [...document.querySelectorAll("input[name='sports']:checked")].map(cb => cb.value);
            const skillLevel = document.querySelector("input[name='skill']:checked")?.value;

            if (selectedSports.length === 0 || !skillLevel) {
              document.getElementById("prefStatus").innerText = " Please select at least one sport and skill level.";
              return;
            }

            await db.collection("users").doc(auth.currentUser.uid).set({
              interests: selectedSports,
              skillLevel: skillLevel
            }, { merge: true });

            document.getElementById("prefStatus").innerText = " Preferences updated!";
            setTimeout(() => {
              document.getElementById("user-section").innerHTML = "";
              document.getElementById("events-section").style.display = "block";
              loadUserEvents();
            }, 800);
          });

          document.getElementById("skipPreferences").addEventListener("click", () => {
            document.getElementById("user-section").innerHTML = "";
            document.getElementById("events-section").style.display = "block";
            loadUserEvents();
          });
        });
      }
    };
    document.addEventListener("click", (e) => {
      const isInside = menuToggle.contains(e.target) || profileMenu.contains(e.target);
      if (!isInside) profileMenu.classList.add("hidden");
    });
    document.getElementById("logoutBtn").addEventListener("click", () => auth.signOut());

  } else {
    // User logged out
    document.getElementById("nav-auth-buttons").style.display = "flex";
    document.getElementById("nav-profile").style.display = "none";
    document.getElementById("profileMenu")?.classList.add("hidden");
    authSection.innerHTML = "";
    userSection.innerHTML = "";
    eventsSection.style.display = "none";
    document.getElementById("admin-panel")?.remove();
    document.getElementById("tagline")?.classList.remove("hidden");
    attachNavListeners();
  }
});

// --- Admin Tabs + Actions ---
function attachAdminTabHandlers(user) {
  document.getElementById("manageSportsBtn")?.addEventListener("click", () => showSection("sports"));
  document.getElementById("manageLocationsBtn")?.addEventListener("click", () => showSection("cities"));
  document.getElementById("addEventBtn")?.addEventListener("click", () => showSection("event"));

  const addSportBtn = document.getElementById("addSportBtn");
  const addCityBtn = document.getElementById("addCityBtn");
  const submitEventBtn = document.getElementById("submitEvent");

  if (addSportBtn) {
    const newBtn = addSportBtn.cloneNode(true);
    addSportBtn.parentNode.replaceChild(newBtn, addSportBtn);
  }
  if (addCityBtn) {
    const newBtn = addCityBtn.cloneNode(true);
    addCityBtn.parentNode.replaceChild(newBtn, addCityBtn);
  }
  if (submitEventBtn) {
    const newBtn = submitEventBtn.cloneNode(true);
    submitEventBtn.parentNode.replaceChild(newBtn, submitEventBtn);
  }

  document.getElementById("addSportBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const sport = document.getElementById("newSport").value.trim();
    if (sport) {
      await db.collection("sports").add({ name: sport });
      document.getElementById("newSport").value = "";
      loadSports();
      populateFilters();
    }
  });

  document.getElementById("addCityBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const city = document.getElementById("newCity").value.trim();
    const area = document.getElementById("newArea").value.trim();
    if (city && area) {
      try {
        const location = await geocodeCityArea(city, area);
        await db.collection("cities").add({ city, area, location });
        document.getElementById("newCity").value = "";
        document.getElementById("newArea").value = "";
        loadCities();
        populateFilters();
      } catch (err) {
        alert("Error adding city/area: " + err.message);
      }
    }
  });

  document.getElementById("submitEvent")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const name = document.getElementById("eventName").value.trim();
    const category = document.getElementById("eventCategory").value.trim();
    const city = document.getElementById("eventCity").value.trim();
    const area = document.getElementById("eventArea").value.trim();
    const time = document.getElementById("eventTime").value;

    if (!name || !category || !city || !area || !time) {
      document.getElementById("eventStatus").innerText = " Please fill all fields.";
      return;
    }

    try {
      const location = await getCityAreaGeoPoint(city, area);
      const eventData = {
        name,
        category,
        city,
        area,
        time,
        createdBy: user.email,
        createdAt: new Date(),
        location,
      };
      await db.collection("events").add(eventData);
      document.getElementById("eventStatus").innerText = " Event added!";
      loadAdminEvents();
      loadUserEvents();
    } catch (err) {
      document.getElementById("eventStatus").innerText = " Error: " + err.message;
    }
  });
}


// Populate Dropdown Filters
async function populateFilters() {
  const cityFilter = document.getElementById("cityFilter");
  const areaFilter = document.getElementById("areaFilter");
  const categoryFilter = document.getElementById("categoryFilter");

  const citiesSnapshot = await db.collection("cities").get();
  const cityAreaMap = {};
  citiesSnapshot.forEach(doc => {
    const { city, area } = doc.data();
    if (!cityAreaMap[city]) cityAreaMap[city] = [];
    if (!cityAreaMap[city].includes(area)) cityAreaMap[city].push(area);
  });

  cityFilter.innerHTML = '<option value="">All Cities</option>';
  Object.keys(cityAreaMap).forEach(city => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    cityFilter.appendChild(opt);
  });

  cityFilter.onchange = () => {
    const selected = cityFilter.value;
    areaFilter.innerHTML = '<option value="">All Areas</option>';
    (cityAreaMap[selected] || []).forEach(area => {
      const opt = document.createElement("option");
      opt.value = area;
      opt.textContent = area;
      areaFilter.appendChild(opt);
    });
    loadUserEvents();
  };

  areaFilter.onchange = loadUserEvents;

  const sportsSnap = await db.collection("sports").get();
  categoryFilter.innerHTML = '<option value="">All Categories</option>';
  sportsSnap.forEach(doc => {
    const opt = document.createElement("option");
    opt.value = doc.data().name;
    opt.textContent = doc.data().name;
    categoryFilter.appendChild(opt);
  });

  categoryFilter.onchange = loadUserEvents;
  loadUserEvents();
}

// Load Events (User View)
async function loadUserEvents() {
  const container = document.getElementById("eventsContainer");
  container.innerHTML = "<p>Loading events...</p>";

  const city = document.getElementById("cityFilter").value;
  const area = document.getElementById("areaFilter").value;
  const category = document.getElementById("categoryFilter").value;

  const user = auth.currentUser;
  const userDoc = await db.collection("users").doc(user.uid).get();
  const userData = userDoc.data();
  const userLocation = userData?.location;
  const userInterests = userData?.interests || [];

  if (!userLocation) {
    container.innerHTML = "<p>Please allow location access to see nearby events.</p>";
    return;
  }

  const snapshot = await db.collection("events").get();
  container.innerHTML = "";

  for (const doc of snapshot.docs) {
    const event = doc.data();
    const eventId = doc.id;

    const isAdmin = user.email === adminEmail;

    const matchesCity = !city || event.city === city;
    const matchesArea = !area || event.area === area;
    const matchesCategory = !category || event.category === category;
    const matchesInterest = isAdmin || (event.category && userInterests.includes(event.category)) || userInterests.length === 0;

    if (matchesCity && matchesArea && matchesCategory && matchesInterest) {
      let distanceKm = "Unknown";
      if (event.location && event.location.latitude && event.location.longitude) {
        const lat1 = userLocation.latitude, lon1 = userLocation.longitude;
        const lat2 = event.location.latitude, lon2 = event.location.longitude;
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distanceKm = (R * c).toFixed(2);
      }

      const joinedUsers = event.joinedUsers || [];
      const isJoined = joinedUsers.includes(user.uid);

      const div = document.createElement("div");
      div.className = "event-card";
      div.innerHTML = `
        <h3>${event.name}</h3>
        <p><strong>Category:</strong> ${event.category}</p>
        <p><strong>Location:</strong> ${event.city}, ${event.area}</p>
        <p><strong>Time:</strong> ${new Date(event.time).toLocaleString()}</p>
        <p><strong>Distance:</strong> ${distanceKm} km</p>
        <p><strong>Players Joined:</strong> ${joinedUsers.length}</p>
        <button onclick="window.open('https://www.google.com/maps?q=${event.location?.latitude},${event.location?.longitude}', '_blank')">View Ground</button>
      `;

      if (event.createdBy === user.email) {
        div.innerHTML += `
          <button class="editEvent" data-id="${doc.id}">Edit</button>
          <button class="deleteEvent" data-id="${doc.id}">Delete</button>
        `;

        div.querySelector(".editEvent").onclick = () => {
          document.getElementById("eventName").value = event.name;
          document.getElementById("eventCategory").value = event.category;
          document.getElementById("eventCity").value = event.city;
          document.getElementById("eventArea").value = event.area;
          document.getElementById("eventTime").value = event.time;
          document.getElementById("submitEvent").textContent = "Update Event";

          const oldBtn = document.getElementById("submitEvent");
          const newBtn = oldBtn.cloneNode(true);
          oldBtn.replaceWith(newBtn);

          newBtn.textContent = "Update Event";
          newBtn.onclick = async () => {
            const city = document.getElementById("eventCity").value.trim();
            const area = document.getElementById("eventArea").value.trim();
            const location = await getCityAreaGeoPoint(city, area);

            await db.collection("events").doc(eventId).update({
              name: document.getElementById("eventName").value,
              category: document.getElementById("eventCategory").value,
              city,
              area,
              time: document.getElementById("eventTime").value,
              location,
              updatedAt: new Date()
            });

            newBtn.textContent = "Submit Event";
            document.getElementById("eventName").value = "";
            document.getElementById("eventCategory").value = "";
            document.getElementById("eventCity").value = "";
            document.getElementById("eventArea").value = "";
            document.getElementById("eventTime").value = "";

            loadAdminEvents?.();
            loadUserEvents?.();
          };
        };

        div.querySelector(".deleteEvent").onclick = async () => {
          await db.collection("events").doc(doc.id).delete();
          loadUserEvents();
        };

      } else {
        if (isJoined) {
          div.innerHTML += `<p style="color: green;"><strong>You have joined this event</strong></p>`;
          const chatBtn = document.createElement("button");
          chatBtn.textContent = "Inside the Huddle";
          chatBtn.onclick = () => {
            window.location.href = `chat.html?eventId=${eventId}`;
          };
          div.appendChild(chatBtn);
        }
        else {
          const joinBtn = document.createElement("button");
          joinBtn.textContent = "Join";
          joinBtn.onclick = async () => {
            await db.collection("events").doc(eventId).update({
              joinedUsers: firebase.firestore.FieldValue.arrayUnion(user.uid)
            });
            loadUserEvents();
          };
          div.appendChild(joinBtn);
        }
      }

      container.appendChild(div);
    }
  }
}

// Load Admin Events
async function loadAdminEvents() {
  const list = document.getElementById("eventsAdminView");
  if (!list) return;
  list.innerHTML = "";

  const snapshot = await db.collection("events").get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const joinedUsers = data.joinedUsers || [];

    let userListHTML = "<ul>";
    for (const userId of joinedUsers) {
      try {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();
        userListHTML += `<li>${userData?.fullName || userData?.email || userId}</li>`;
      } catch (err) {
        userListHTML += `<li>Unknown User (${userId})</li>`;
      }
    }
    userListHTML += "</ul>";

    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${data.name}</strong> — ${data.city}, ${data.area} | ${data.category} @ ${new Date(data.time).toLocaleString()}
      <br><strong>Joined Users (${joinedUsers.length}):</strong> ${userListHTML}
      <button class="editEvent" data-id="${doc.id}">Edit</button>
      <button class="deleteEvent" data-id="${doc.id}">Delete</button>
    `;
    list.appendChild(li);
  }

  list.querySelectorAll(".deleteEvent").forEach(btn => {
    btn.onclick = async () => {
      await db.collection("events").doc(btn.dataset.id).delete();
      loadAdminEvents();
      loadUserEvents();
    };
  });

  list.querySelectorAll(".editEvent").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const docData = await db.collection("events").doc(id).get();
      const data = docData.data();
      document.getElementById("eventName").value = data.name;
      document.getElementById("eventCategory").value = data.category;
      document.getElementById("eventCity").value = data.city;
      document.getElementById("eventArea").value = data.area;
      document.getElementById("eventTime").value = data.time;
      document.getElementById("submitEvent").textContent = "Update Event";

      const oldBtn = document.getElementById("submitEvent");
      const newBtn = oldBtn.cloneNode(true);
      oldBtn.replaceWith(newBtn);

      newBtn.textContent = "Update Event";
      newBtn.onclick = async () => {
        const city = document.getElementById("eventCity").value.trim();
        const area = document.getElementById("eventArea").value.trim();
        const location = await getCityAreaGeoPoint(city, area);

        await db.collection("events").doc(id).update({
          name: document.getElementById("eventName").value,
          category: document.getElementById("eventCategory").value,
          city,
          area,
          time: document.getElementById("eventTime").value,
          location,
          updatedAt: new Date()
        });

        newBtn.textContent = "Submit Event";
        document.getElementById("eventName").value = "";
        document.getElementById("eventCategory").value = "";
        document.getElementById("eventCity").value = "";
        document.getElementById("eventArea").value = "";
        document.getElementById("eventTime").value = "";

        loadAdminEvents?.();
        loadUserEvents?.();
      };
    };
  });
}
// Load Sports
function loadSports() {
  const list = document.getElementById("sportsList");
  if (!list) return;
  list.innerHTML = "";
  db.collection("sports").get().then(snapshot => {
    snapshot.forEach(doc => {
      const li = document.createElement("li");
      li.innerHTML = `${doc.data().name} <button onclick="deleteSport('${doc.id}')">Delete</button>`;
      list.appendChild(li);
    });
  });
}

// Load Cities
function loadCities() {
  const list = document.getElementById("citiesList");
  if (!list) return;
  list.innerHTML = "";
  db.collection("cities").get().then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      const li = document.createElement("li");
      li.innerHTML = `${data.city} - ${data.area} <button onclick="deleteCity('${doc.id}')">Delete</button>`;
      list.appendChild(li);
    });
  });
}

// Delete Functions
window.deleteSport = async (id) => {
  await db.collection("sports").doc(id).delete();
  alert("Sport deleted");
  loadSports();
  populateFilters();
};

window.deleteCity = async (id) => {
  await db.collection("cities").doc(id).delete();
  alert("City/Area deleted");
  loadCities();
  populateFilters();
};

document.addEventListener("DOMContentLoaded", attachNavListeners);




