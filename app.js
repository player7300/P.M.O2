// app.js

import { createClient }
from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* =========================================================
   SUPABASE CONFIG
   Replace these two values with your own Supabase values.
   NEVER put the service_role key here.
========================================================= */

const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentUser = null;
let currentProfile = null;
let currentProject = null;
let projects = [];


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = id => document.getElementById(id);

function show(id) {
  $(id)?.classList.remove("hidden");
}

function hide(id) {
  $(id)?.classList.add("hidden");
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = Number(bytes);

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }

  return `${size.toFixed(size >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function toast(message, error = false) {
  const el = $("toast");

  el.textContent = message;
  el.className = error ? "toast error-toast" : "toast";

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.className = "";
  }, 3500);
}

function randomString(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
}

function makeProjectId() {
  return `PRJ-${randomString(8)}`;
}

function makeFileId() {
  return `FILE-${randomString(12)}`;
}

function cleanFileName(name) {
  return name
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 150);
}


/* =========================================================
   PAGE NAVIGATION
========================================================= */

function showPage(page) {

  document.querySelectorAll(".page").forEach(el => {
    el.classList.add("hidden");
  });

  const target = $(`${page}Page`);

  if (target) {
    target.classList.remove("hidden");
  }

  if (page === "projects") {
    loadProjects();
  }

  if (page === "admin" && currentProfile?.role === "admin") {
    loadAdmin();
  }
}

document.querySelectorAll("[data-page]").forEach(button => {

  button.addEventListener("click", () => {

    const page = button.dataset.page;

    if (
      page === "admin" &&
      currentProfile?.role !== "admin"
    ) {
      return;
    }

    showPage(page);
  });

});


$("backProjects").addEventListener("click", () => {
  showPage("projects");
});


/* =========================================================
   AUTHENTICATION
========================================================= */

function usernameToEmail(username) {

  username = username
    .trim()
    .toLowerCase();

  return `${username}@ppa.local`;
}


async function login() {

  const username = $("username")
    .value
    .trim()
    .toLowerCase();

  const password = $("password").value;

  $("loginError").textContent = "";

  if (!username || !password) {

    $("loginError").textContent =
      "Username and password are required.";

    return;
  }

  if (!/^[a-z0-9._-]+$/.test(username)) {

    $("loginError").textContent =
      "Invalid username.";

    return;
  }

  $("loginBtn").disabled = true;
  $("loginBtn").textContent = "LOGINNING...";

  const { data, error } =
    await supabase.auth.signInWithPassword({

      email: usernameToEmail(username),

      password
    });

  $("loginBtn").disabled = false;
  $("loginBtn").textContent = "LOGIN";

  if (error) {

    $("loginError").textContent =
      error.message;

    return;
  }

  currentUser = data.user;

  await loadProfile();

}


$("loginBtn").addEventListener(
  "click",
  login
);


$("password").addEventListener(
  "keydown",
  e => {

    if (e.key === "Enter") {
      login();
    }

  }
);


$("logoutBtn").addEventListener(
  "click",
  async () => {

    await supabase.auth.signOut();

    currentUser = null;
    currentProfile = null;

    hide("app");
    show("loginScreen");

    $("password").value = "";
  }
);


/* =========================================================
   PROFILE
========================================================= */

async function loadProfile() {

  if (!currentUser) return;

  const { data, error } =
    await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();

  if (error || !data) {

    await supabase.auth.signOut();

    $("loginError").textContent =
      "Your account profile was not found.";

    return;
  }

  currentProfile = data;

  hide("loginScreen");
  show("app");

  $("accountUsername").textContent =
    data.username;

  $("accountUserId").textContent =
    data.user_id;

  $("accountRole").textContent =
    data.role.toUpperCase();

  if (data.role === "admin") {

    show("adminNav");

  } else {

    hide("adminNav");
  }

  await loadProjects();

  showPage("home");

}


/* =========================================================
   PROJECTS
========================================================= */

async function loadProjects() {

  const { data, error } =
    await supabase
      .from("projects")
      .select("*")
      .order("created_at", {
        ascending: false
      });

  if (error) {

    toast(error.message, true);

    return;
  }

  projects = data || [];

  $("projectCount").textContent =
    projects.length;

  renderProjects(projects);

  let totalFiles = 0;

  for (const project of projects) {

    const { count } =
      await supabase
        .from("files")
        .select("*", {
          count: "exact",
          head: true
        })
        .eq(
          "project_id",
          project.project_id
        );

    totalFiles += count || 0;
  }

  $("fileCount").textContent =
    totalFiles;
}


function renderProjects(list) {

  const container = $("projectsList");

  if (!list.length) {

    container.innerHTML =
      `<p class="muted">No projects found.</p>`;

    return;
  }

  container.innerHTML =
    list.map(project => `

      <article class="project-card">

        <div>

          <h3>
            ${escapeHTML(project.name)}
          </h3>

          <p>
            ${escapeHTML(
              project.description || "No description."
            )}
          </p>

          <small>
            ${escapeHTML(project.project_id)}
          </small>

        </div>

        <button
          class="open-project"
          data-id="${escapeHTML(project.project_id)}">
          OPEN
        </button>

      </article>

    `).join("");

  document
    .querySelectorAll(".open-project")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => openProject(button.dataset.id)
      );

    });
}


$("searchInput").addEventListener(
  "input",
  e => {

    const query =
      e.target.value
        .trim()
        .toLowerCase();

    const filtered =
      projects.filter(project =>

        project.name
          .toLowerCase()
          .includes(query)

        ||

        (project.description || "")
          .toLowerCase()
          .includes(query)

        ||

        project.project_id
          .toLowerCase()
          .includes(query)

      );

    renderProjects(filtered);
  }
);


/* =========================================================
   PROJECT DETAILS
========================================================= */

async function openProject(projectId) {

  const project =
    projects.find(
      p => p.project_id === projectId
    );

  if (!project) return;

  currentProject = project;

  showPage("project");

  const details =
    $("projectDetails");

  details.innerHTML = `
    <h2>${escapeHTML(project.name)}</h2>

    <p>
      ${escapeHTML(project.description || "")}
    </p>

    <p class="muted">
      ${escapeHTML(project.project_id)}
    </p>

    <div id="coverArea"></div>

    <h3>FILES</h3>

    <div id="projectFilesList">
      Loading...
    </div>
  `;

  if (project.cover_path) {

    const { data, error } =
      await supabase.storage
        .from("project-files")
        .createSignedUrl(
          project.cover_path,
          3600
        );

    if (!error && data?.signedUrl) {

      $("coverArea").innerHTML = `
        <img
          class="project-cover"
          src="${data.signedUrl}"
          alt="Project cover">
      `;
    }
  }

  const { data: files, error } =
    await supabase
      .from("files")
      .select("*")
      .eq(
        "project_id",
        project.project_id
      )
      .order("created_at", {
        ascending: true
      });

  if (error) {

    $("projectFilesList").textContent =
      error.message;

    return;
  }

  if (!files?.length) {

    $("projectFilesList").innerHTML =
      `<p class="muted">No files.</p>`;

    return;
  }

  $("projectFilesList").innerHTML =
    files.map(file => `

      <div class="file-row">

        <div>

          <b>
            ${escapeHTML(file.name)}
          </b>

          <small>
            ${escapeHTML(file.id)}
            ·
            ${formatBytes(file.size)}
          </small>

        </div>

        <button
          class="download-file"
          data-path="${escapeHTML(file.storage_path)}">
          DOWNLOAD
        </button>

      </div>

    `).join("");

  document
    .querySelectorAll(".download-file")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => downloadFile(
          button.dataset.path
        )
      );

    });
}


async function downloadFile(path) {

  const { data, error } =
    await supabase.storage
      .from("project-files")
      .createSignedUrl(
        path,
        300
      );

  if (error || !data?.signedUrl) {

    toast(
      "Could not create download link.",
      true
    );

    return;
  }

  window.open(
    data.signedUrl,
    "_blank"
  );
}


/* =========================================================
   ADMIN
========================================================= */

async function loadAdmin() {

  if (currentProfile?.role !== "admin") {
    return;
  }

  await loadUsers();
  await loadAdminProjects();
}


async function loadUsers() {

  const { data, error } =
    await supabase
      .from("profiles")
      .select("*")
      .order("user_id", {
        ascending: true
      });

  if (error) {

    $("usersList").textContent =
      error.message;

    return;
  }

  $("usersList").innerHTML =
    data.map(user => `

      <div class="user-row">

        <div>

          <b>
            ${escapeHTML(user.username)}
          </b>

          <small>
            ID: ${escapeHTML(
              String(user.user_id)
            )}
          </small>

        </div>

        ${
          user.user_id === 1000000001
          ?

          `<strong>PRIMARY ADMIN</strong>`

          :

          `
          <select
            class="role-select"
            data-id="${user.id}">

            <option
              value="user"
              ${user.role === "user" ? "selected" : ""}>
              USER
            </option>

            <option
              value="admin"
              ${user.role === "admin" ? "selected" : ""}>
              ADMIN
            </option>

          </select>

          <button
            class="save-role"
            data-id="${user.id}">
            SAVE
          </button>
          `
        }

      </div>

    `).join("");

  document
    .querySelectorAll(".save-role")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const id =
            button.dataset.id;

          const select =
            document.querySelector(
              `.role-select[data-id="${id}"]`
            );

          updateUserRole(
            id,
            select.value
          );
        }
      );
    });
}


async function updateUserRole(
  userId,
  role
) {

  const { error } =
    await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId);

  if (error) {

    toast(
      error.message,
      true
    );

    return;
  }

  toast(
    "User role updated."
  );

  await loadUsers();
}


/* =========================================================
   CREATE PROJECT
========================================================= */

$("createProjectBtn").addEventListener(
  "click",
  createProject
);


async function createProject() {

  if (currentProfile?.role !== "admin") {

    toast(
      "Admin access required.",
      true
    );

    return;
  }

  const name =
    $("projectName")
      .value
      .trim();

  const description =
    $("projectDescription")
      .value
      .trim();

  const cover =
    $("projectCover")
      .files[0];

  const fileList =
    Array.from(
      $("projectFiles").files
    );

  if (!name) {

    toast(
      "Project name is required.",
      true
    );

    return;
  }

  for (const file of fileList) {

    if (file.size > 25 * 1024 * 1024) {

      toast(
        `${file.name} is larger than 25 MB.`,
        true
      );

      return;
    }
  }

  if (
    cover &&
    cover.size > 10 * 1024 * 1024
  ) {

    toast(
      "Cover image must be smaller than 10 MB.",
      true
    );

    return;
  }

  const button =
    $("createProjectBtn");

  button.disabled = true;
  button.textContent = "UPLOADING...";

  $("uploadStatus").textContent =
    "Creating project...";

  let projectId =
    makeProjectId();

  let uploadedPaths = [];

  try {

    let created = false;

    for (let i = 0; i < 10; i++) {

      const { error } =
        await supabase
          .from("projects")
          .insert({
            project_id: projectId,
            name,
            description,
            created_by: currentUser.id
          });

      if (!error) {

        created = true;
        break;
      }

      if (error.code !== "23505") {
        throw error;
      }

      projectId =
        makeProjectId();
    }

    if (!created) {
      throw new Error(
        "Could not create unique project ID."
      );
    }


    /* COVER */

    if (cover) {

      const path =
        `covers/${projectId}/${Date.now()}-${cleanFileName(cover.name)}`;

      const { error } =
        await supabase.storage
          .from("project-files")
          .upload(
            path,
            cover,
            {
              upsert: false
            }
          );

      if (error) throw error;

      uploadedPaths.push(path);

      const { error: updateError } =
        await supabase
          .from("projects")
          .update({
            cover_path: path
          })
          .eq(
            "project_id",
            projectId
          );

      if (updateError) {
        throw updateError;
      }
    }


    /* FILES */

    for (const file of fileList) {

      const fileId =
        makeFileId();

      const path =
        `files/${projectId}/${fileId}-${cleanFileName(file.name)}`;

      $("uploadStatus").textContent =
        `Uploading ${file.name}...`;

      const { error } =
        await supabase.storage
          .from("project-files")
          .upload(
            path,
            file,
            {
              upsert: false
            }
          );

      if (error) throw error;

      uploadedPaths.push(path);

      const { error: dbError } =
        await supabase
          .from("files")
          .insert({

            id: fileId,

            project_id: projectId,

            name: file.name,

            size: file.size,

            mime_type:
              file.type ||
              "application/octet-stream",

            storage_path: path
          });

      if (dbError) throw dbError;
    }


    $("projectName").value = "";
    $("projectDescription").value = "";
    $("projectCover").value = "";
    $("projectFiles").value = "";

    $("uploadStatus").textContent =
      "";

    toast(
      "✓ Upload completed successfully"
    );

    await loadProjects();
    await loadAdminProjects();

  } catch (error) {

    console.error(error);

    for (const path of uploadedPaths) {

      await supabase.storage
        .from("project-files")
        .remove([path]);
    }

    await supabase
      .from("projects")
      .delete()
      .eq(
        "project_id",
        projectId
      );

    $("uploadStatus").textContent =
      "";

    toast(
      error.message ||
      "Upload failed.",
      true
    );

  } finally {

    button.disabled = false;
    button.textContent =
      "CREATE PROJECT";
  }
}


/* =========================================================
   ADMIN PROJECT LIST
========================================================= */

async function loadAdminProjects() {

  const { data, error } =
    await supabase
      .from("projects")
      .select("*")
      .order("created_at", {
        ascending: false
      });

  if (error) {

    $("adminProjects").textContent =
      error.message;

    return;
  }

  if (!data?.length) {

    $("adminProjects").innerHTML =
      `<p class="muted">No projects.</p>`;

    return;
  }

  $("adminProjects").innerHTML =
    data.map(project => `

      <div class="admin-project-row">

        <div>

          <b>
            ${escapeHTML(project.name)}
          </b>

          <small>
            ${escapeHTML(project.project_id)}
          </small>

        </div>

        <button
          class="delete-project"
          data-id="${escapeHTML(project.project_id)}">
          DELETE
        </button>

      </div>

    `).join("");

  document
    .querySelectorAll(".delete-project")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => deleteProject(
          button.dataset.id
        )
      );

    });
}


async function deleteProject(projectId) {

  if (
    !confirm(
      "Delete this project and all its files?"
    )
  ) {
    return;
  }

  const { data: files } =
    await supabase
      .from("files")
      .select("storage_path")
      .eq(
        "project_id",
        projectId
      );

  const paths =
    (files || [])
      .map(file => file.storage_path);

  const { data: project } =
    await supabase
      .from("projects")
      .select("cover_path")
      .eq(
        "project_id",
        projectId
      )
      .single();

  if (
    project?.cover_path
  ) {
    paths.push(
      project.cover_path
    );
  }

  if (paths.length) {

    await supabase.storage
      .from("project-files")
      .remove(paths);
  }

  const { error } =
    await supabase
      .from("projects")
      .delete()
      .eq(
        "project_id",
        projectId
      );

  if (error) {

    toast(
      error.message,
      true
    );

    return;
  }

  toast(
    "Project deleted."
  );

  await loadProjects();
  await loadAdminProjects();
}


/* =========================================================
   SESSION CHECK
========================================================= */

async function initialize() {

  const {
    data: {
      session
    }
  } =
    await supabase.auth.getSession();

  if (session) {

    currentUser =
      session.user;

    await loadProfile();

  } else {

    hide("app");
    show("loginScreen");
  }
}


supabase.auth.onAuthStateChange(
  (event, session) => {

    setTimeout(async () => {

      if (
        event === "SIGNED_IN" &&
        session
      ) {

        currentUser =
          session.user;

        await loadProfile();

      }

      if (
        event === "SIGNED_OUT"
      ) {

        currentUser = null;
        currentProfile = null;

        hide("app");
        show("loginScreen");
      }

    }, 0);
  }
);


initialize();