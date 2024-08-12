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

function formatRawMaterial(material, tagType) {
    return `<${tagType}>${material}</${tagType}>`;
}

function possiblePath(path) {
    if (path.startsWith("./")) {
        return path.substring(2);
    }
    return path;
}

async function fetchFile(path, files, expectImage) {
    for (let file of files) {
        if (file.name === possiblePath(path) && file.type === "file") {
            return await fetch(file.download_url).then(async (response) => await (expectImage ? response.blob() : response.text()));
        }
        // TODO: implement using paths which include folders
    }
    errorIf(true, `File "${path}" not found in files list`);
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
            formattedHTML += `<img src="${URL.createObjectURL(await fetchFile(imgInfo.src, files, true))}" ${imgInfo.additionalData} />`;
            continue;
        }
        htmlElement.innerHTML = line;
        console.log(line);
        let type = htmlElement.firstChild.nodeName.toLowerCase();
        let attributes = htmlElement.firstChild.attributes;
        if (type === "link" && attributes.rel.value === "stylesheet") {
            if (attributes.href.value.startsWith("http")) {
                formattedHTML += `${line}\n`;
                continue;
            }
            formattedHTML += formatRawMaterial(await fetchFile(attributes.href.value, files), "style");
            continue;
        }
        if (type === "script" && "src" in attributes) {
            if (attributes.src.value.startsWith("http")) {
                formattedHTML += `${line}\n`;
                continue;
            }
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
    const responseText = fetchFile("index.html", files);
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