# @transmission-dynamics/capacitor-file-chunk Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v1.1.0 - 2024-06-04

### Added

- FileChunkManager TypeScript class to be able to use the whole plugin independently. (#2)

### Fixed

- (iOS) The initialization of FileHandle object in readFileChunk method. (#1)
