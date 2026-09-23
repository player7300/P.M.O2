import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";


/* =========================================================
   SUPABASE
   ========================================================= */

const SUPABASE_URL =
    "YOUR_SUPABASE_URL";

const SUPABASE_ANON_KEY =
    "YOUR_SUPABASE_ANON_KEY";

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);


/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let currentProfile = null;
let projects = [];
let currentProject = null;


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}


function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function usernameToEmail(username) {

    return (
        String(username)
            .trim()
            .toLowerCase()
        + "@ppa.local"
    );
}


function formatSize(bytes) {

    bytes = Number(bytes || 0);

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}


function isAdmin() {

    return (
        currentProfile &&
        currentProfile.role === "admin"
    );
}


function generateProjectId() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let result = "PRJ-";

    for (let i = 0; i < 8; i++) {

        result += chars[
            Math.floor(
                Math.random() * chars.length
            )
        ];
    }

    return result;
}


function generateFileId() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let result = "FILE-";

    for (let i = 0; i < 12; i++) {

        result += chars[
            Math.floor(
                Math.random() * chars.length
            )
        ];
    }

    return result;
}


function showLoginError(message) {

    const box = $("loginError");

    if (box) {
        box.textContent = message;
    }
}


function clearLoginError() {

    const box = $("loginError");

    if (box) {
        box.textContent = "";
    }
}


function showAdminMessage(
    message,
    success = false
) {

    const box = $("adminMsg");

    if (!box) return;

    box.textContent = message;

    box.className =
        success
            ? "admin-message success"
            : "admin-message";
}


/* =========================================================
   LOGIN
   ========================================================= */

async function login() {

    const username =
        $("username")?.value.trim() || "";

    const password =
        $("password")?.value || "";

    clearLoginError();

    if (!username) {

        showLoginError(
            "Please enter your username."
        );

        return;
    }

    if (!password) {

        showLoginError(
            "Please enter your password."
        );

        return;
    }

    const email =
        usernameToEmail(username);

    const {
        data,
        error
    } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {

        const msg =
            String(error.message || "")
                .toLowerCase();

        if (
            msg.includes("invalid") ||
            msg.includes("credential")
        ) {

            showLoginError(
                "Password is incorrect."
            );

        } else {

            showLoginError(
                "Login failed. Please check your username and password."
            );
        }

        return;
    }

    if (!data?.user) {

        showLoginError(
            "Login failed."
        );

        return;
    }

    currentUser = data.user;

    await loadCurrentProfile();

    if (!currentProfile) {

        await supabase.auth.signOut();

        currentUser = null;

        showLoginError(
            "Your account profile could not be loaded."
        );

        return;
    }

    showApplication();

    await loadProjects();

    page("home");
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

    await supabase.auth.signOut();

    currentUser = null;
    currentProfile = null;
    projects = [];
    currentProject = null;

    showLoginPage();
}


/* =========================================================
   PROFILE
   ========================================================= */

async function loadCurrentProfile() {

    if (!currentUser) {

        currentProfile = null;

        return null;
    }

    const {
        data,
        error
    } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();

    if (error) {

        console.error(
            "Profile error:",
            error
        );

        currentProfile = null;

        return null;
    }

    currentProfile = data;

    return data;
}


/* =========================================================
   SESSION
   ========================================================= */

async function checkSession() {

    const {
        data: {
            session
        }
    } = await supabase.auth.getSession();

    if (!session) {

        showLoginPage();

        return;
    }

    currentUser = session.user;

    const profile =
        await loadCurrentProfile();

    if (!profile) {

        await supabase.auth.signOut();

        currentUser = null;

        showLoginPage();

        return;
    }

    showApplication();

    await loadProjects();

    page("home");
}


/* =========================================================
   LOGIN / APP
   ========================================================= */

function showLoginPage() {

    $("loginPage")?.classList.remove(
        "hidden"
    );

    $("app")?.classList.add(
        "hidden"
    );
}


function showApplication() {

    $("loginPage")?.classList.add(
        "hidden"
    );

    $("app")?.classList.remove(
        "hidden"
    );

    updateNavigation();
    updateAccount();
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function page(name) {

    const pages = [
        "homePage",
        "projectsPage",
        "projectPage",
        "aboutPage",
        "accountPage",
        "adminPage"
    ];

    pages.forEach(id => {

        $(id)?.classList.add(
            "hidden"
        );
    });

    const target =
        $(`${name}Page`);

    if (target) {
        target.classList.remove(
            "hidden"
        );
    }

    if (name === "home") {
        renderHome();
    }

    if (name === "projects") {
        renderProjects();
    }

    if (name === "account") {
        updateAccount();
    }

    if (name === "admin") {

        if (!isAdmin()) {

            page("home");

            return;
        }

        renderAdmin();
    }
}


function updateNavigation() {

    const nav =
        $("adminNav");

    if (!nav) return;

    if (isAdmin()) {

        nav.classList.remove(
            "hidden"
        );

    } else {

        nav.classList.add(
            "hidden"
        );
    }
}


/* =========================================================
   PROJECTS
   ========================================================= */

async function loadProjects() {

    const {
        data,
        error
    } = await supabase
        .from("projects")
        .select("*")
        .order(
            "created_at",
            {
                ascending: false
            }
        );

    if (error) {

        console.error(
            "Projects error:",
            error
        );

        projects = [];

        return;
    }

    projects = data || [];

    renderHome();
    renderProjects();
}


/* =========================================================
   HOME
   ========================================================= */

function renderHome() {

    const welcome =
        $("homeWelcome");

    if (
        welcome &&
        currentProfile
    ) {

        welcome.textContent =
            `Welcome, ${currentProfile.username}.`;
    }

    const container =
        $("homeProjects");

    if (!container) return;

    const latest =
        projects.slice(0, 6);

    if (!latest.length) {

        container.innerHTML =
            `<div class="muted">No projects available.</div>`;

        return;
    }

    container.innerHTML =
        latest
            .map(projectCard)
            .join("");
}


/* =========================================================
   PROJECT LIST
   ========================================================= */

function renderProjects() {

    const container =
        $("projectsGrid");

    if (!container) return;

    const query =
        (
            $("search")?.value || ""
        )
        .trim()
        .toLowerCase();

    const filtered =
        projects.filter(project => {

            const name =
                String(
                    project.name || ""
                ).toLowerCase();

            const description =
                String(
                    project.description || ""
                ).toLowerCase();

            const id =
                String(
                    project.project_id || ""
                ).toLowerCase();

            return (
                !query ||
                name.includes(query) ||
                description.includes(query) ||
                id.includes(query)
            );
        });

    if (!filtered.length) {

        container.innerHTML =
            `<div class="muted">No projects found.</div>`;

        return;
    }

    container.innerHTML =
        filtered
            .map(projectCard)
            .join("");
}


/* =========================================================
   PROJECT CARD
   ========================================================= */

function projectCard(project) {

    return `
        <article class="card">

            <div class="card-body">

                <h3>
                    ${escapeHTML(project.name)}
                </h3>

                <p class="muted">
                    ${escapeHTML(
                        project.description || ""
                    )}
                </p>

                <div class="muted">
                    ${escapeHTML(
                        project.project_id
                    )}
                </div>

                <button
                    class="btn"
                    onclick="openProject('${project.project_id}')"
                >
                    OPEN PROJECT
                </button>

            </div>

        </article>
    `;
}


/* =========================================================
   OPEN PROJECT
   ========================================================= */

async function openProject(
    projectId
) {

    const project =
        projects.find(
            p =>
                p.project_id ===
                projectId
        );

    if (!project) {
        return;
    }

    currentProject =
        project;

    const title =
        $("projectTitle");

    if (title) {

        title.textContent =
            project.name ||
            "PROJECT";
    }

    await renderProjectDetails(
        project
    );

    page("project");
}


/* =========================================================
   PROJECT DETAILS
   ========================================================= */

async function renderProjectDetails(
    project
) {

    const container =
        $("projectView");

    if (!container) return;

    const {
        data: files,
        error
    } = await supabase
        .from("files")
        .select("*")
        .eq(
            "project_id",
            project.project_id
        )
        .order(
            "created_at",
            {
                ascending: false
            }
        );

    if (error) {

        container.innerHTML =
            `<div class="muted">Unable to load files.</div>`;

        return;
    }

    let coverHTML = "";

    if (project.cover_path) {

        const {
            data
        } = await supabase.storage
            .from("project-files")
            .createSignedUrl(
                project.cover_path,
                3600
            );

        if (data?.signedUrl) {

            coverHTML = `
                <div class="project-cover">

                    <img
                        src="${data.signedUrl}"
                        alt="Project cover"
                    >

                </div>
            `;
        }
    }

    let filesHTML = "";

    if (!files?.length) {

        filesHTML =
            `<div class="muted">No files in this project.</div>`;

    } else {

        filesHTML =
            files.map(file => {

                return `
                    <div class="file-row">

                        <div>

                            <strong>
                                ${escapeHTML(
                                    file.name
                                )}
                            </strong>

                            <div class="muted">
                                ${formatSize(
                                    file.size
                                )}
                            </div>

                            <div class="muted">
                                ${escapeHTML(
                                    file.id
                                )}
                            </div>

                        </div>

                        <button
                            class="btn"
                            onclick="downloadFile(
                                '${file.storage_path}',
                                '${escapeHTML(file.name)}'
                            )"
                        >
                            DOWNLOAD
                        </button>

                    </div>
                `;
            }).join("");
    }

    container.innerHTML = `

        ${coverHTML}

        <div class="project-description">

            <h3>
                ${escapeHTML(
                    project.name
                )}
            </h3>

            <p>
                ${escapeHTML(
                    project.description || ""
                )}
            </p>

            <div class="muted">
                PROJECT ID:
                ${escapeHTML(
                    project.project_id
                )}
            </div>

        </div>

        <hr>

        <h3>
            FILES
        </h3>

        <div class="files-list">
            ${filesHTML}
        </div>
    `;
}


/* =========================================================
   DOWNLOAD
   ========================================================= */

async function downloadFile(
    storagePath,
    fileName
) {

    const {
        data,
        error
    } = await supabase.storage
        .from("project-files")
        .createSignedUrl(
            storagePath,
            3600
        );

    if (
        error ||
        !data?.signedUrl
    ) {

        alert(
            "Unable to create download link."
        );

        return;
    }

    const link =
        document.createElement(
            "a"
        );

    link.href =
        data.signedUrl;

    link.download =
        fileName || "download";

    link.target = "_blank";

    document.body.appendChild(
        link
    );

    link.click();

    link.remove();
}


/* =========================================================
   ACCOUNT
   ========================================================= */

function updateAccount() {

    const container =
        $("accountInfo");

    if (
        !container ||
        !currentProfile
    ) {
        return;
    }

    container.innerHTML = `

        <div class="account-row">

            <span>
                Username
            </span>

            <strong>
                ${escapeHTML(
                    currentProfile.username
                )}
            </strong>

        </div>

        <div class="account-row">

            <span>
                User ID
            </span>

            <strong>
                ${escapeHTML(
                    currentProfile.user_id
                )}
            </strong>

        </div>

        <div class="account-row">

            <span>
                Email
            </span>

            <strong>
                ${escapeHTML(
                    currentProfile.email || ""
                )}
            </strong>

        </div>

        <div class="account-row">

            <span>
                Role
            </span>

            <strong>
                ${escapeHTML(
                    currentProfile.role
                )}
            </strong>

        </div>
    `;
}


/* =========================================================
   ADMIN
   ========================================================= */

async function renderAdmin() {

    if (!isAdmin()) {

        page("home");

        return;
    }

    const {
        count: fileCount
    } = await supabase
        .from("files")
        .select(
            "*",
            {
                count: "exact",
                head: true
            }
        );

    $("statProjects").textContent =
        projects.length;

    $("statFiles").textContent =
        fileCount || 0;


    const {
        data: users
    } = await supabase
        .from("profiles")
        .select("*")
        .order(
            "user_id",
            {
                ascending: true
            }
        );

    $("statUsers").textContent =
        users?.length || 0;

    renderAdminUsers(
        users || []
    );

    renderAdminProjects();
}


/* =========================================================
   ADMIN PROJECTS
   ========================================================= */

function renderAdminProjects() {

    const container =
        $("adminProjects");

    if (!container) return;

    if (!projects.length) {

        container.innerHTML =
            `<div class="muted">No projects found.</div>`;

        return;
    }

    container.innerHTML =
        projects.map(project => {

            return `
                <div class="admin-project-row">

                    <div>

                        <strong>
                            ${escapeHTML(
                                project.name
                            )}
                        </strong>

                        <div class="muted">
                            ${escapeHTML(
                                project.project_id
                            )}
                        </div>

                    </div>

                    <div class="admin-actions">

                        <button
                            class="btn"
                            onclick="openProject('${project.project_id}')"
                        >
                            OPEN
                        </button>

                        <button
                            class="btn danger"
                            onclick="deleteProject('${project.project_id}')"
                        >
                            DELETE
                        </button>

                    </div>

                </div>
            `;
        }).join("");
}


/* =========================================================
   ADMIN USERS
   ========================================================= */

function renderAdminUsers(
    users
) {

    const container =
        $("adminUsers");

    if (!container) return;

    if (!users.length) {

        container.innerHTML =
            `<div class="muted">No users found.</div>`;

        return;
    }

    container.innerHTML =
        users.map(user => {

            const primaryAdmin =
                user.username === "admin";

            return `
                <div class="user-row">

                    <div>

                        <strong>
                            ${escapeHTML(
                                user.username
                            )}
                        </strong>

                        <div class="muted">
                            ID:
                            ${escapeHTML(
                                user.user_id
                            )}
                        </div>

                        <div class="muted">
                            ${escapeHTML(
                                user.email || ""
                            )}
                        </div>

                    </div>

                    <div>

                        <select
                            onchange="
                                changeUserRole(
                                    '${user.id}',
                                    this.value
                                )
                            "
                            ${primaryAdmin ? "disabled" : ""}
                        >

                            <option
                                value="user"
                                ${
                                    user.role === "user"
                                        ? "selected"
                                        : ""
                                }
                            >
                                USER
                            </option>

                            <option
                                value="admin"
                                ${
                                    user.role === "admin"
                                        ? "selected"
                                        : ""
                                }
                            >
                                ADMIN
                            </option>

                        </select>

                    </div>

                </div>
            `;
        }).join("");
}


/* =========================================================
   CHANGE ROLE
   ========================================================= */

async function changeUserRole(
    userId,
    role
) {

    if (!isAdmin()) {
        return;
    }

    const {
        error
    } = await supabase
        .from("profiles")
        .update({
            role
        })
        .eq(
            "id",
            userId
        );

    if (error) {

        console.error(
            "Role error:",
            error
        );

        showAdminMessage(
            "Unable to update user role."
        );

        return;
    }

    showAdminMessage(
        "User role updated successfully.",
        true
    );

    await renderAdmin();
}


/* =========================================================
   CREATE PROJECT
   ========================================================= */

async function createProject() {

    if (!isAdmin()) {
        return;
    }

    const name =
        $("projectName")
            ?.value
            .trim() || "";

    const description =
        $("projectDescription")
            ?.value
            .trim() || "";

    const coverFile =
        $("projectCover")
            ?.files?.[0] || null;

    const files =
        Array.from(
            $("projectFiles")
                ?.files || []
        );

    if (!name) {

        showAdminMessage(
            "Project name is required."
        );

        return;
    }

    const projectId =
        generateProjectId();

    let coverPath = null;

    try {

        /* COVER */

        if (coverFile) {

            if (
                coverFile.size >
                25 * 1024 * 1024
            ) {

                throw new Error(
                    "Cover image is larger than 25 MB."
                );
            }

            const extension =
                coverFile.name.includes(".")
                    ? "." +
                      coverFile.name
                        .split(".")
                        .pop()
                        .toLowerCase()
                    : "";

            coverPath =
                `${projectId}/cover${extension}`;

            const {
                error
            } = await supabase.storage
                .from("project-files")
                .upload(
                    coverPath,
                    coverFile
                );

            if (error) {
                throw error;
            }
        }


        /* PROJECT */

        const {
            error: projectError
        } = await supabase
            .from("projects")
            .insert({
                project_id: projectId,
                name,
                description,
                cover_path: coverPath,
                created_by:
                    currentUser.id
            });

        if (projectError) {
            throw projectError;
        }


        /* FILES */

        for (const file of files) {

            if (
                file.size >
                25 * 1024 * 1024
            ) {

                throw new Error(
                    `${file.name} is larger than 25 MB.`
                );
            }

            const fileId =
                generateFileId();

            const safeName =
                file.name.replace(
                    /[\\/:*?"<>|]/g,
                    "_"
                );

            const storagePath =
                `${projectId}/${fileId}-${safeName}`;

            const {
                error: uploadError
            } = await supabase.storage
                .from("project-files")
                .upload(
                    storagePath,
                    file
                );

            if (uploadError) {
                throw uploadError;
            }

            const {
                error: dbError
            } = await supabase
                .from("files")
                .insert({
                    id: fileId,
                    project_id: projectId,
                    name: file.name,
                    size: file.size,
                    mime_type:
                        file.type || null,
                    storage_path:
                        storagePath
                });

            if (dbError) {
                throw dbError;
            }
        }


        /* SUCCESS */

        showAdminMessage(
            "✓ Upload completed successfully.",
            true
        );

        $("projectName").value = "";
        $("projectDescription").value = "";
        $("projectCover").value = "";
        $("projectFiles").value = "";

        await loadProjects();

        await renderAdmin();

    } catch (error) {

        console.error(
            "Create project error:",
            error
        );

        /*
         * Remove project database row.
         * Files may also be removed below.
         */

        try {

            const {
                data: createdFiles
            } = await supabase
                .from("files")
                .select("storage_path")
                .eq(
                    "project_id",
                    projectId
                );

            const paths = [];

            if (coverPath) {
                paths.push(coverPath);
            }

            createdFiles?.forEach(
                file => {

                    if (file.storage_path) {
                        paths.push(
                            file.storage_path
                        );
                    }

                }
            );

            if (paths.length) {

                await supabase.storage
                    .from("project-files")
                    .remove(paths);
            }

            await supabase
                .from("projects")
                .delete()
                .eq(
                    "project_id",
                    projectId
                );

        } catch (cleanupError) {

            console.error(
                "Cleanup error:",
                cleanupError
            );
        }

        showAdminMessage(
            `Upload failed: ${
                error.message ||
                "Unknown error"
            }`
        );
    }
}


/* =========================================================
   DELETE PROJECT
   ========================================================= */

async function deleteProject(
    projectId
) {

    if (!isAdmin()) {
        return;
    }

    const project =
        projects.find(
            p =>
                p.project_id ===
                projectId
        );

    if (!project) {
        return;
    }

    const confirmed =
        confirm(
            `Delete project "${project.name}"?`
        );

    if (!confirmed) {
        return;
    }

    try {

        const {
            data: files
        } = await supabase
            .from("files")
            .select("storage_path")
            .eq(
                "project_id",
                projectId
            );

        const paths = [];

        if (project.cover_path) {
            paths.push(
                project.cover_path
            );
        }

        files?.forEach(file => {

            if (file.storage_path) {
                paths.push(
                    file.storage_path
                );
            }

        });

        if (paths.length) {

            await supabase.storage
                .from("project-files")
                .remove(paths);
        }

        const {
            error
        } = await supabase
            .from("projects")
            .delete()
            .eq(
                "project_id",
                projectId
            );

        if (error) {
            throw error;
        }

        showAdminMessage(
            "Project deleted successfully.",
            true
        );

        await loadProjects();

        await renderAdmin();

    } catch (error) {

        console.error(
            "Delete error:",
            error
        );

        showAdminMessage(
            "Unable to delete project."
        );
    }
}


/* =========================================================
   AUTH STATE
   ========================================================= */

supabase.auth.onAuthStateChange(
    async (
        event,
        session
    ) => {

        if (
            event ===
            "SIGNED_OUT"
        ) {

            currentUser = null;
            currentProfile = null;

            showLoginPage();

            return;
        }

        if (
            session &&
            !currentUser
        ) {

            currentUser =
                session.user;

            await loadCurrentProfile();

            if (currentProfile) {

                showApplication();

                await loadProjects();
            }
        }
    }
);


/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        showLoginPage();

        await checkSession();

    }
);


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.login =
    login;

window.logout =
    logout;

window.page =
    page;

window.openProject =
    openProject;

window.downloadFile =
    downloadFile;

window.createProject =
    createProject;

window.deleteProject =
    deleteProject;

window.changeUserRole =
    changeUserRole;

window.renderProjects =
    renderProjects;

window.renderAdmin =
    renderAdmin;