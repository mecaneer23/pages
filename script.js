function errorIf(condition, message) {
    if (condition) {
        alert(message);
        throw Error(message);
    }
}

function parseUrl(url) {
    errorIf(
        !url.startsWith("https://github.com/"),
        "Invalid url: must be full github url"
    );
    const [user, repo, _, possibleBranch, ...rest] = url.replace("https://github.com/", "").split("/");
    const path = rest.join("/");
    const branch = possibleBranch ? `?ref=${possibleBranch}` : "";
    errorIf(!repo, `Repo "${repo}" not found`);
    return {
        user: user,
        repo: repo,
        path: path,
        branch: branch,
    };
}

async function folderLinkToList(folderLink) {
    const url = parseUrl(folderLink);
    const fetchUrl = `https://api.github.com/repos/${url.user}/${url.repo}/contents/${url.path}${url.branch}`;
    return fetch(fetchUrl).then((response) => {
        errorIf(!response.ok, `Invalid repository "${url.repo}"`);
        return response.json();
    });
}

function createFrame() {
    const frame = document.createElement("iframe");
    frame.style.width = "100vw";
    frame.style.height = "100vh";
    frame.style.position = "absolute";
    frame.style.top = "0";
    frame.style.left = "0";
    frame.style.border = "none";
    document.body.appendChild(frame);
    return frame;
}

function getIndexFile(files) {
    for (let file of files) {
        if (file.name === "index.html" && file.type === "file") {
            return file.download_url;
        }
    }
    return null;
}

function formatRawMaterial(material, tagType) {
    return `<${tagType}>${material}</${tagType}>`;
}

async function fetchFile(path, files) {
    for (let file of files) {
        if (file.name === path && file.type === "file") {
            return await fetch(file.download_url).then(async (response) => await response.text());
        }
        // TODO: implement using paths which include folders
    }
    errorIf(true, `File "${path}" not found in files list`);
}

async function handleImports(indexHtml, files) {
    let formattedHTML = "";
    let title = "Pages"
    const htmlElement = document.createElement("div");
    for (let line of indexHtml.split("\n")) {
        if (line.includes("<" + "head")) {  // Concatenated because would run when parsing source otherwise
            formattedHTML += `<base target="_parent">\n`;
        }
        if (line.length == 0 || !line.match(/<((link)|(script)|(title))/)) {
            formattedHTML += `${line}\n`;
            continue;
        }
        htmlElement.innerHTML = line.trim();
        let type = htmlElement.firstChild.nodeName.toLowerCase();
        let attributes = htmlElement.firstChild.attributes;
        if (type === "link" && attributes.rel.value === "stylesheet") {
            formattedHTML += formatRawMaterial(await fetchFile(attributes.href.value, files), "style");
            continue;
        }
        if (type === "script" && "src" in attributes) {
            formattedHTML += formatRawMaterial(await fetchFile(attributes.src.value, files), "script");
            continue;
        }
        if (type === "title") {
            title = htmlElement.firstChild.innerHTML;
        }
        formattedHTML += `${line}\n`;
    }
    return {
        html: formattedHTML,
        title: title,
    };
}

async function run() {
    const files = await folderLinkToList(document.getElementById("url").value);
    const rawUrl = getIndexFile(files);
    errorIf(!rawUrl, "No `index.html` found in entered folder");
    fetch(rawUrl).then(async (response) => {
        const formattedHTML = await handleImports(await response.text(), files);
        errorIf(!formattedHTML, "Import failed, file not found");
        const frame = createFrame();
        const text = formattedHTML.html;
        if (!text) {
            return;
        }
        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(text);
        doc.close();
        document.querySelector("form").style.display = "none";
        document.body.style.all = "initial";
        document.querySelector(".github-corner").style.display = "none";
        document.title = formattedHTML.title;
    });
}