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
    return fetch(fetchUrl).then(async (response) => {
        errorIf(!response.ok, `Invalid repository "${url.repo}"`);
        return {
            files: await response.json(),
            folder: url.path ? url.path.split("/").slice(-1) : url.repo
        };
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

function formatRawMaterial(material, tagType) {
    return `<${tagType}>${material}</${tagType}>`;
}

function leftStrip(string, substring) {
    if (string.startsWith(substring)) {
        return string.substring(substring.length);
    }
    return string;
}

async function fetchFile(path, files, folder, expectImage) {
    let fileString = "";
    for (let entry of files) {
        fileString += entry.path + "\n";
        if (entry.name === leftStrip(path, "./").split("/")[0]) {
            if (entry.type === "file") {
                return await fetch(entry.download_url).then(response => expectImage ? response.blob() : response.text());
            }
            if (entry.type === "dir") {
                return fetchFile(path.split("/").slice(1).join("/"), await fetch(entry.url).then(response => response.json()), "", expectImage);
            }
            errorIf(true, `Unknown file type '${entry.type}' for ${entry.name}`);
        }
    }
    errorIf(true, `File '${path}' not found in files list:\n\n${fileString}`);
}

function parseImgTag(line) {
    const match = line.match(/<img\s+([^>]*)\s*src=\"([^\"]*)\"(.*?)>/);
    if (!match) {
        return { isImage: false };
    }
    return {
        isImage: true,
        src: match[2],
        additionalData: match[3]
    };
}

async function handleImports(indexHtml, files) {
    let formattedHTML = "";
    let title = "Pages"
    let prevLine = "";
    const htmlElement = document.createElement("div");
    for (let line of indexHtml.split("\n")) {
        line = line.trim();
        if (prevLine) {
            line = prevLine + line;
            prevLine = "";
        }
        if (line.startsWith("<") && !line.endsWith(">")) {
            prevLine = line;
            continue;
        }
        if (line.includes("<" + "head")) {  // Concatenated because would run when parsing source otherwise
            formattedHTML += `<base target="_parent">\n`;
        }
        if (line.length == 0 || !line.match(/<((link)|(script)|(title)|(img))/)) {
            formattedHTML += `${line}\n`;
            continue;
        }
        const imgInfo = parseImgTag(line);
        if (imgInfo.isImage) {
            formattedHTML += `<img src="${URL.createObjectURL(await fetchFile(imgInfo.src, files, "", true))}" ${imgInfo.additionalData} />`;
            continue;
        }
        htmlElement.innerHTML = line;
        let type = htmlElement.firstChild.nodeName.toLowerCase();
        let attributes = htmlElement.firstChild.attributes;
        if (type === "link" && attributes.rel.value === "stylesheet") {
            if (attributes.href.value.startsWith("http")) {
                formattedHTML += `${line}\n`;
                continue;
            }
            formattedHTML += formatRawMaterial(await fetchFile(attributes.href.value, files, "", false), "style");
            continue;
        }
        if (type === "script" && "src" in attributes) {
            if (attributes.src.value.startsWith("http")) {
                formattedHTML += `${line}\n`;
                continue;
            }
            formattedHTML += formatRawMaterial(await fetchFile(attributes.src.value, files, "", false), "script");
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
    const folderData = await folderLinkToList(document.getElementById("url").value);
    const files = folderData.files;
    const responseText = fetchFile("index.html", files, folderData.folder, false);
    const formattedHTML = await handleImports(await responseText, files);
    errorIf(!formattedHTML, "Import failed, file not found");  // Steps to get this error?
    const frame = createFrame();
    const text = formattedHTML.html;
    errorIf(!text, "Empty index.html file?");  // Steps to get this error?
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(text);
    doc.close();
    document.querySelector("form").style.display = "none";
    document.body.style.all = "initial";
    document.querySelector(".github-corner").style.display = "none";
    document.title = formattedHTML.title;
}