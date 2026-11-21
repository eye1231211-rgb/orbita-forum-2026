# Download only group names and their public navigation context from the REU timetable.
$ErrorActionPreference = 'Stop'
$base = 'https://rasp.rea.ru/'
$headers = @{ 'X-Requested-With'='XMLHttpRequest'; Referer=$base }
$homePage = Invoke-WebRequest -Uri $base -TimeoutSec 30 -SessionVariable reuSession

function Read-Options([string]$html, [string]$name) {
    $select = [regex]::Match($html, '(?s)<select\b[^>]*name="' + $name + '"[^>]*>(.*?)</select>')
    if (!$select.Success) { throw "Missing timetable selector: $name" }
    foreach ($match in [regex]::Matches($select.Groups[1].Value, '<option\b[^>]*value="([^"]*)"[^>]*>([^<]*)</option>')) {
        $value = [Net.WebUtility]::HtmlDecode($match.Groups[1].Value).Trim()
        if ($value -and $value -notin @('na','-1')) {
            [pscustomobject]@{value=$value; label=[Net.WebUtility]::HtmlDecode($match.Groups[2].Value).Trim()}
        }
    }
}
function Read-Next($field, $faculty, $course='na', $level='na') {
    $form = @{Faculty=$faculty; Course=$course; Type=$level; Group='na'; Cathedra='na'; Teacher='na'; ChangedNode=$field}
    $form.ChangedValue = $form[$field]
    $reply = Invoke-WebRequest -Method Post -Uri ($base+'Schedule/Navigator') -Form $form -Headers $headers -WebSession $reuSession -TimeoutSec 30
    $reply.Content
}
$sections = [Collections.Generic.List[object]]::new()
foreach ($school in (Read-Options $homePage.Content 'Faculty')) {
    $courses = Read-Options (Read-Next 'Faculty' $school.value) 'Course'
    foreach ($course in $courses) {
        $levels = Read-Options (Read-Next 'Course' $school.value $course.value) 'Type'
        foreach ($level in $levels) {
            $codes = @(Read-Options (Read-Next 'Type' $school.value $course.value $level.value) 'Group' | Select-Object -ExpandProperty value | Sort-Object -Unique)
            if ($codes.Count) {
                $sections.Add([ordered]@{school=$school.label; course=$course.label; level=$level.label; groups=$codes})
            }
        }
    }
}
if (!$sections.Count) { throw 'No group records in timetable response' }
$result = [ordered]@{source=$base; checkedAt=[TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,'Russian Standard Time').ToString('yyyy-MM-dd'); sections=$sections}
$outputPath = Join-Path $PSScriptRoot '../public/reu-groups.json'
[IO.File]::WriteAllText($outputPath, ($result | ConvertTo-Json -Depth 6 -Compress), [Text.UTF8Encoding]::new($false))
$count = ($sections | ForEach-Object {$_.groups.Count} | Measure-Object -Sum).Sum
Write-Output "Imported $count group entries in $($sections.Count) sections."
