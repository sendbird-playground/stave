import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { build } from "vite"

import {
  PUBLIC_DOC_SECTIONS,
  flattenPublicDocs,
} from "../site/src/public-docs"

const repoRoot = process.cwd()
const docsRoot = path.join(repoRoot, "docs")
const outputRoot = path.join(repoRoot, ".pages-dist")
const generatedModulePath = path.join(
  repoRoot,
  "site",
  "src",
  "generated",
  "public-docs.generated.ts",
)
const docsHomeOutputPath = path.join(outputRoot, "docs", "index.html")

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .trim()
}

function extractDocTitle(rawMarkdown: string, sourcePath: string) {
  const titleMatch = rawMarkdown.match(/^#\s+(.+)$/m)
  return titleMatch?.[1]?.trim() ?? path.basename(sourcePath, ".md")
}

function extractDocDescription(rawMarkdown: string) {
  const paragraphs = rawMarkdown
    .replace(/^#\s+.+$/m, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)

  for (const paragraph of paragraphs) {
    if (
      paragraph.startsWith("##")
      || paragraph.startsWith("###")
      || paragraph.startsWith("- ")
      || paragraph.startsWith("* ")
      || /^\d+\.\s+/.test(paragraph)
      || paragraph.startsWith("```")
      || paragraph.startsWith("![")
      || paragraph.startsWith("|")
      || paragraph.startsWith("<")
    ) {
      continue
    }

    const cleaned = stripInlineMarkdown(paragraph)
    if (cleaned.length > 0 && !cleaned.endsWith(":")) {
      return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned
    }
  }

  return "Reference documentation for using Stave."
}

function routeHref(fromRoute: string, targetRoute: string) {
  if (fromRoute === targetRoute) {
    return "./"
  }

  return `../${targetRoute}/`
}

function assetHref(fromRoute: string, targetAssetPath: string) {
  return `../${targetAssetPath}`
}

async function createGeneratedModule() {
  const publicDocRoutes = flattenPublicDocs()
  const routeBySourcePath = new Map<string, string>()

  for (const doc of publicDocRoutes) {
    const resolvedPath = path.resolve(repoRoot, doc.sourcePath)
    if (routeBySourcePath.has(resolvedPath)) {
      throw new Error(`Duplicate public docs source path: ${doc.sourcePath}`)
    }

    routeBySourcePath.set(resolvedPath, doc.routePath)
  }

  const transformedSections = []

  for (const section of PUBLIC_DOC_SECTIONS) {
    const transformedDocs = []

    for (const doc of section.docs) {
      const resolvedSourcePath = path.resolve(repoRoot, doc.sourcePath)
      const rawMarkdown = await readFile(resolvedSourcePath, "utf8")
      const transformedMarkdown = rawMarkdown.replace(
        /(!?\[[^\]]*?\])\(([^)]+)\)/g,
        (_match, label, rawTarget) => {
          const target = rawTarget.trim()

          if (
            target.startsWith("http://")
            || target.startsWith("https://")
            || target.startsWith("mailto:")
            || target.startsWith("#")
          ) {
            return `${label}(${target})`
          }

          const [targetPath, hash = ""] = target.split("#")
          const resolvedTargetPath = path.resolve(
            path.dirname(resolvedSourcePath),
            targetPath,
          )

          if (resolvedTargetPath === path.join(repoRoot, "README.md")) {
            return `${label}(https://github.com/sendbird-playground/stave${hash ? `#${hash}` : ""})`
          }

          if (resolvedTargetPath.endsWith(".md") && resolvedTargetPath.startsWith(docsRoot)) {
            const targetRoute = routeBySourcePath.get(resolvedTargetPath)

            if (!targetRoute) {
              throw new Error(
                `Public doc ${doc.routePath} links to non-public markdown: ${target}`,
              )
            }

            const href = routeHref(doc.routePath, targetRoute)
            return `${label}(${hash ? `${href}#${hash}` : href})`
          }

          if (resolvedTargetPath.startsWith(docsRoot)) {
            const relativeAssetPath = path
              .relative(docsRoot, resolvedTargetPath)
              .split(path.sep)
              .join("/")
            const href = assetHref(doc.routePath, relativeAssetPath)
            return `${label}(${hash ? `${href}#${hash}` : href})`
          }

          return `${label}(${target})`
        },
      )

      transformedDocs.push({
        routePath: doc.routePath,
        sourcePath: doc.sourcePath,
        title: extractDocTitle(rawMarkdown, resolvedSourcePath),
        description: extractDocDescription(rawMarkdown),
        previewImage: doc.previewImage,
        featured: doc.featured ?? false,
        content: transformedMarkdown,
      })
    }

    transformedSections.push({
      id: section.id,
      title: section.title,
      description: section.description,
      docs: transformedDocs,
    })
  }

  await mkdir(path.dirname(generatedModulePath), { recursive: true })
  await writeFile(
    generatedModulePath,
    `export const siteData = ${JSON.stringify({ sections: transformedSections }, null, 2)} as const\n`,
  )
}

async function duplicateDocsShell() {
  const docsHtmlTemplate = await readFile(docsHomeOutputPath, "utf8")
  const docsHomeHtml = docsHtmlTemplate.replaceAll("__DOC_ROUTE__", "home")
  await writeFile(docsHomeOutputPath, docsHomeHtml)

  const docHtmlTemplate = docsHtmlTemplate
    .replaceAll('="../assets/', '="../../assets/')
    .replaceAll('="./assets/', '="../../assets/')

  for (const doc of flattenPublicDocs()) {
    const outputPath = path.join(outputRoot, "docs", doc.routePath, "index.html")
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, docHtmlTemplate.replaceAll("__DOC_ROUTE__", doc.routePath))
  }
}

async function copyStaticAssets() {
  await cp(
    path.join(repoRoot, "docs", "screenshots"),
    path.join(outputRoot, "docs", "screenshots"),
    { recursive: true },
  )
}

async function main() {
  await createGeneratedModule()

  await build({
    configFile: path.join(repoRoot, "vite.site.config.ts"),
    logLevel: "info",
  })

  await duplicateDocsShell()
  await copyStaticAssets()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
