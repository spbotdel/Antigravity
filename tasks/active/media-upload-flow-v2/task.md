# Task

## Title

Media Upload Flow V2

## Problem

Current media upload behavior is not acceptable for a real family archive workflow.

Observed problems:

- photo upload can fail with `spawn ENAMETOOLONG`
- only one file can be selected at a time
- video upload from device is not supported in the main file flow
- the current split between file upload and external video link is not user-centric
- there is no visible upload progress, speed, or remaining-time feedback
- there is no explicit limits copy near the upload action
- current preview architecture still needs a dedicated thumbnail/variant plan for heavy family archives

## Expected Behavior

The user should be able to:

- upload both photos and videos from desktop or mobile device through one clear file flow
- select and upload multiple files in one action
- keep external video links as a secondary optional path, not the main video path
- see per-upload progress with percentage, speed, and remaining time
- see limits and constraints near the upload action
- rely on a media architecture where previews do not load full originals by default

## Status

in_progress

## Priority

high
