import progressBar from "./progress-bar";
import {GitHubUserResponse} from "./github-api";
import {CommitInfo, Release} from "./interfaces";

const UNRELEASED_TAG = "___unreleased___";
const COMMIT_FIX_REGEX = /(fix|close|resolve)(e?s|e?d)? [T#](\d+)/i;

interface CategoryInfo {
  name: string | undefined;
  commits: CommitInfo[];
}

interface Options {
  categories: string[];
  baseIssueUrl: string;
}

export default class MarkdownRenderer {
  private options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  renderMarkdown(releases: Release[]) {
    return `\n${releases
      .map((release) => this.renderRelease(release))
      .filter(Boolean)
      .join("\n\n\n")}`;
  }

  renderRelease(release: Release): string | undefined {
    // Group commits in release by category
    const categories = this.groupByCategory(release.commits);
    const categoriesWithCommits = categories.filter((category) => category.commits.length > 0);

    // Skip this iteration if there are no commits available for the release
    if (categoriesWithCommits.length === 0) return "";

    const releaseTitle = release.name === UNRELEASED_TAG ? "Unreleased" : release.name;

    let markdown = `## ${releaseTitle} (${release.date})`;

    progressBar.init(categories.length);

    for (const category of categoriesWithCommits) {
      progressBar.setTitle(category.name || "Other");

      markdown += `\n\n#### ${category.name}\n`;

      if (this.hasPackages(category.commits)) {
        markdown += this.renderContributionsByPackage(category.commits);
      } else {
        markdown += this.renderContributionList(category.commits);
      }

      progressBar.tick();
    }

    progressBar.terminate();

    if (release.contributors) {
      markdown += `\n\n${this.renderContributorList(release.contributors)}`;
    }

    return markdown;
  }

  hasPackages(commits: CommitInfo[]) {
    return commits.some((commit) => commit.packages !== undefined && commit.packages.length > 0);
  }

  renderContributionsByPackage(commits: CommitInfo[]) {
    // Group commits in category by package
    const commitsByPackage: { [id: string]: CommitInfo[] } = {};
    for (const commit of commits) {
      // Array of unique packages.
      const changedPackages = commit.packages || [];

      const packageName = this.renderPackageNames(changedPackages);

      commitsByPackage[packageName] = commitsByPackage[packageName] || [];
      commitsByPackage[packageName].push(commit);
    }

    const packageNames = Object.keys(commitsByPackage);

    return packageNames.map((packageName) => {
      const commits = commitsByPackage[packageName];
      return `* ${packageName}\n${this.renderContributionList(commits, "  ")}`;
    }).join("\n");
  }

  renderPackageNames(packageNames: string[]) {
    return packageNames.length > 0
      ? packageNames.map((pkg) => `\`${pkg}\``).join(", ")
      : "Other";
  }

  renderContributionList(commits: CommitInfo[], prefix: string = ""): string {
    return commits
      .map((commit) => this.renderContribution(commit))
      .filter(Boolean)
      .map((rendered) => `${prefix}* ${rendered}`)
      .join("\n");
  }

  renderContribution(commit: CommitInfo): string | undefined {
    const issue = commit.githubIssue;
    if (issue) {
      let markdown = "";

      if (issue.number && issue.pull_request && issue.pull_request.html_url) {
        const prUrl = issue.pull_request.html_url;
        markdown += `[#${issue.number}](${prUrl}) `;
      }

      if (issue.title && issue.title.match(COMMIT_FIX_REGEX)) {
        issue.title = issue.title.replace(
          COMMIT_FIX_REGEX,
          `Closes [#$3](${this.options.baseIssueUrl}$3)`
        );
      }

      markdown += `${issue.title}. ([@${issue.user.login}](${issue.user.html_url}))`;

      return markdown;
    }
  }

  renderContributorList(contributors: GitHubUserResponse[]) {
    const renderedContributors = contributors.map((contributor) => `- ${this.renderContributor(contributor)}`).sort();

    return `#### Committers: ${contributors.length}\n${renderedContributors.join("\n")}`;
  }

  renderContributor(contributor: GitHubUserResponse): string {
    const userNameAndLink = `[${contributor.login}](${contributor.html_url})`;
    if (contributor.name) {
      return `${contributor.name} (${userNameAndLink})`;
    } else {
      return userNameAndLink;
    }
  }

  groupByCategory(allCommits: CommitInfo[]): CategoryInfo[] {
    return this.options.categories.map((name) => {
      // Keep only the commits that have a matching label with the one
      // provided in the lerna.json config.
      let commits = allCommits
        .filter((commit) => commit.categories && commit.categories.indexOf(name) !== -1);

      return { name, commits };
    });
  }
}
