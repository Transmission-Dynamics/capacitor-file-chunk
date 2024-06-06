# @transmission-dynamics/capacitor-file-chunk Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v1.0.0-td.1.1.2 - 2024-06-06

### Changed

- Project versioning to schema: \<ORIGINAL-PROJECT-VERSION>-td.\<MAJOR>.\<MINOR>.\<PATCH>

## v1.1.1 - 2024-06-04

### Fixed

- (iOS) The naming associated with `.podspec` file.

## v1.1.0 - 2024-06-04

### Added

- FileChunkManager TypeScript class to be able to use the whole plugin independently. (#2)

### Fixed

- (iOS) The initialization of FileHandle object in readFileChunk method. (#1)
