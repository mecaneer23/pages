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
    const urlData = parseUrl(folderLink);
    const baseUrl = `https://api.github.com/repos/${urlData.user}/${urlData.repo}/contents/`;
    return fetch(`${baseUrl}${urlData.path}${urlData.branch}`).then(async (response) => {
        errorIf(!response.ok, `Invalid repository "${urlData.repo}"`);
        return {
            files: await response.json(),
            folder: urlData.path ? urlData.path.split("/").slice(-1)[0] : urlData.repo,
            baseUrl: baseUrl,
            branch: urlData.branch
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

function getIndexFromPath(path, currentFolder) {
    let index = 0;
    if (path.startsWith("/")) {
        index++;
    }
    if (leftStrip(path, "/").startsWith(currentFolder)) {
        index++;
    }
    return index;
}

async function performFetch(download_url, expectImage) {
    return await fetch(download_url).then(response => expectImage ? response.blob() : response.text());
}

async function fetchFile(path, files, currentFolder, expectImage, urlInfo) {
    if (path.length > 1 && path.startsWith("/") && path.split("/")[1] !== currentFolder) {
        const url = await fetch(`${urlInfo.baseUrl}${leftStrip(path, "/")}${urlInfo.branch}`).then(response => response.json());
        return performFetch(url.download_url, expectImage);
    }
    const name = leftStrip(path, "./").split("/")[getIndexFromPath(path, currentFolder)];
    for (let entry of files) {
        if (entry.name === name) {
            if (entry.type === "file") {
                return performFetch(entry.download_url, expectImage);
            }
            if (entry.type === "dir") {
                return fetchFile(
                    path.split("/").slice(path.startsWith("/") ? 2 : 1).join("/"),
                    await fetch(entry.url).then(response => response.json()),
                    path.split("/").slice(-2, -1)[0] || "/",
                    expectImage,
                    urlInfo
                );
            }
            errorIf(true, `Unknown file type '${entry.type}' for ${entry.name}`);
        }
    }
    errorIf(true, `File '${name}' not found in files list`);
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

async function handleImports(indexHtml, files, folder, urlInfo) {
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
            formattedHTML += `<img src="${URL.createObjectURL(await fetchFile(imgInfo.src, files, folder, true, urlInfo))}" ${imgInfo.additionalData} />`;
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
            formattedHTML += formatRawMaterial(await fetchFile(attributes.href.value, files, folder, false, urlInfo), "style");
            continue;
        }
        if (type === "script" && "src" in attributes) {
            if (attributes.src.value.startsWith("http")) {
                formattedHTML += `${line}\n`;
                continue;
            }
            formattedHTML += formatRawMaterial(await fetchFile(attributes.src.value, files, folder, false, urlInfo), "script");
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
    const folder = folderData.folder;
    const urlInfo = {
        baseUrl: folderData.baseUrl,
        branch: folderData.branch
    };
    const responseText = fetchFile("index.html", files, folder, false, urlInfo);
    const formattedHTML = await handleImports(await responseText, files, folder, urlInfo);
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