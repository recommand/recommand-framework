#!/usr/bin/env bun

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { getProjectRoot } from './utils';
import { colors } from './utils';

try {

  // Change working directory to the root of the project
  const rootDir = getProjectRoot();
  process.chdir(rootDir);

  // Ask for package name
  let name = await prompt(`${colors.blue}Enter package name:${colors.reset} `) ?? "";

  // Make name lowercase, remove non-alphanumeric characters, and replace spaces with hyphens
  name = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  if (!name || name.trim() === '') {
    console.error(`${colors.red}❌ Package name cannot be empty${colors.reset}`);
    process.exit(1);
  }

  // Ask for git remote
  const gitRemote = await prompt(`${colors.blue}Enter git remote URL for the submodule:${colors.reset} `, `git@github.com:recommand/recommand-${name}.git`);

  if (!gitRemote || gitRemote.trim() === '') {
    console.error(`${colors.red}❌ Git remote URL cannot be empty${colors.reset}`);
    process.exit(1);
  }

  const packageName = name.trim();
  const gitRemoteUrl = gitRemote.trim();
  const currentDir = process.cwd();
  const parentDir = dirname(dirname(currentDir)); // Go up two levels to get to root
  const packagePath = join('packages', packageName);

  // Check if directory already exists
  if (existsSync(packagePath)) {
    console.error(`${colors.red}❌ Directory 'packages/${packageName}' already exists${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.blue}${colors.bold}Creating package ${packageName} in ${packagePath}${colors.reset}`);

  // Create submodule from template repository
  console.log(`${colors.yellow}📥 Creating submodule from template...${colors.reset}`);
  execSync(`git submodule add git@github.com:recommand/recommand-template.git ${packagePath}`, {
    stdio: 'inherit',
  });

  // Update the submodule remote to point to user's repository
  console.log(`${colors.yellow}🔗 Updating submodule remote...${colors.reset}`);
  execSync(`git remote set-url origin ${gitRemoteUrl}`, {
    stdio: 'inherit',
    cwd: packagePath
  });

  // Update package.json with new package name
  console.log(`${colors.yellow}📝 Updating package.json...${colors.reset}`);
  const packageJsonPath = join(packagePath, 'package.json');

  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    packageJson.name = packageName;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  }

  // Install dependencies
  console.log(`${colors.yellow}📦 Installing dependencies...${colors.reset}`);
  execSync(`bun install`, {
    stdio: 'inherit',
    cwd: packagePath
  });

  console.log(`\n${colors.green}✅ Git submodule package created successfully!${colors.reset}`);
  console.log(`\n${colors.blue}Note:${colors.reset} This is now a git submodule package pointing to your repository: ${gitRemoteUrl}`);
} catch (error) {
  console.error(`${colors.red}❌ Error creating package:${colors.reset}`, error instanceof Error ? error.message : String(error));
  process.exit(1);
}