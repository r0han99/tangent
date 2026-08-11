# Rename GitHub repo (last step)

Do this **after** Chrome Web Store 2.0.0 is live, then immediately update the
CWS privacy + homepage URLs.

1. GitHub → `r0han99/tangent` → Settings → General → Repository name → `offthread`
2. Locally:

```bash
git remote set-url origin https://github.com/r0han99/offthread.git
```

3. Re-enable GitHub Pages on `main` / root if needed.
4. New URLs:
   - https://github.com/r0han99/offthread
   - https://r0han99.github.io/offthread/
   - https://r0han99.github.io/offthread/privacy.html
5. Update those URLs in the Chrome Web Store listing the same day.

Old `r0han99/tangent` links redirect for a long time, but the Pages path
changes — do not delay the CWS privacy URL update.
