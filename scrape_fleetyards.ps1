#Requires -Version 5.1

<#
.SYNOPSIS
    Scrapes ship data from the Fleetyards API and saves it as a TypeScript file.
.DESCRIPTION
    This script fetches ship model data from the public Fleetyards API,
    paginates through all available data, and then formats the collected
    data into a TypeScript array, which is saved to lib/ships.ts.
.NOTES
    Ensure you have an internet connection.
    The script will create the 'lib' directory if it doesn't exist
    in the current working directory.
#>

param (
    [string]$BaseUrl = "https://api.fleetyards.net/v1/models",
    [int]$PerPage = 240,
    [string]$OutputDirectory = "lib",
    [string]$OutputFileName = "ships.ts"
)

# Ensure the output directory exists
$FullOutputDir = Join-Path -Path $PSScriptRoot -ChildPath $OutputDirectory
if (-not (Test-Path -Path $FullOutputDir -PathType Container)) {
    try {
        New-Item -ItemType Directory -Path $FullOutputDir -ErrorAction Stop | Out-Null
        Write-Host "Created directory: $FullOutputDir"
    }
    catch {
        Write-Error "Failed to create output directory: $FullOutputDir. Error: $($_.Exception.Message)"
        exit 1
    }
}

$OutputFilePath = Join-Path -Path $FullOutputDir -ChildPath $OutputFileName
$SkippedOutputFilePath = Join-Path -Path $FullOutputDir -ChildPath "ships-without-identifier.ts" # New file for skipped ships

Write-Host "Starting Fleetyards API scrape..."
Write-Host "Data will be saved to: $OutputFilePath"

$allShipsData = [System.Collections.Generic.List[PSObject]]::new()
$currentPage = 1
$continueFetching = $true

while ($continueFetching) {
    $apiUrl = "$($BaseUrl)?page=$($currentPage)&perPage=$($PerPage)"
    Write-Host "Fetching page $($currentPage): $($apiUrl)"

    try {
        Write-Host "Attempting Invoke-WebRequest..."
        $rawResponse = Invoke-WebRequest -Uri $apiUrl -Method Get -TimeoutSec 60 -ErrorAction SilentlyContinue # Capture errors manually
        Write-Host "Invoke-WebRequest completed. Last command success: $?"

        if (-not $?) {
            Write-Error "Invoke-WebRequest failed. Error details: $($Error[0] | Out-String)"
            $continueFetching = $false
            continue
        }

        Write-Host "Status Code: $($rawResponse.StatusCode)"
        Write-Host "Raw content snippet (first 200 chars): $($rawResponse.Content.Substring(0, [System.Math]::Min($rawResponse.Content.Length, 200)))"

        if ($rawResponse.StatusCode -ne 200) {
            Write-Error "API request failed with status code: $($rawResponse.StatusCode) - $($rawResponse.StatusDescription)"
            $continueFetching = $false
            continue
        }

        $response = $null
        try {
            Write-Host "Attempting ConvertFrom-Json..."
            $response = $rawResponse.Content | ConvertFrom-Json
            Write-Host "ConvertFrom-Json completed."
        }
        catch {
            Write-Error "Failed to parse JSON response for page $($currentPage). Exception: $($_.Exception.GetType().FullName) - $($_.Exception.Message | Out-String)"
            Write-Host "Raw content leading to parse error (first 500 chars): $($rawResponse.Content.Substring(0, [System.Math]::Min($rawResponse.Content.Length, 500)))"
            $continueFetching = $false
            continue
        }

        if ($null -eq $response) { # Check if $response is null after ConvertFrom-Json
            Write-Warning "JSON response was null after parsing for page $($currentPage)."
            $continueFetching = $false
            continue
        }

        # Ensure $response is treated as an array, even if only one item is returned
        if ($response -isnot [array] -and $response -is [psobject]) {
            $response = @($response)
        }

        if ($response -isnot [System.Collections.ICollection] -or $response.Count -eq 0) {
            Write-Host "No data items returned or response is not a collection for page $($currentPage). Assuming end of data."
            $continueFetching = $false
        } else {
            try {
                $typedResponse = $response | ForEach-Object { [PSObject]$_ }
                foreach ($item in $typedResponse) {
                    $allShipsData.Add($item)
                }
            }
            catch {
                Write-Error "Error during Add item to collection: $($_.Exception.GetType().FullName) - $($_.Exception.Message)"
                Write-Host "Problematic item (if available): $($item | Out-String)"
                $continueFetching = $false
            }
            if ($continueFetching) {
                 Write-Host "Processed $($response.Count) items from page $($currentPage). Total items in list: $($allShipsData.Count)"
            }

            if ($response.Count -lt $PerPage) {
                Write-Host "Fetched fewer items than perPage limit. This is likely the last page."
                $continueFetching = $false
            } else {
                $currentPage++
            }
        }
    }
    catch {
        $ErrorMessage = "Error fetching page $($currentPage). Exception Type: $($_.Exception.GetType().FullName)"
        if ($_.Exception.Message) {
            $FlatMessage = $($_.Exception.Message | Out-String) # Flatten the message
            $ErrorMessage += " - Message: $($FlatMessage)"
        }
        if ($_.Exception.Response) {
            $ErrorMessage += " - Status Code: $($_.Exception.Response.StatusCode)"
        }
        Write-Error $ErrorMessage

        # If it's a 404 on a subsequent page, it's likely the end. Otherwise, could be a network issue.
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode -eq [System.Net.HttpStatusCode]::NotFound -and $currentPage -gt 1) {
            Write-Warning "Received 404 Not Found. Assuming this is the end of the data."
        } else {
             Write-Warning "An error occurred. Stopping further requests. Partial data might be written if any was collected."
        }
        $continueFetching = $false # Stop on any error
    }
}

Write-Host "Finished fetching data. Total ships collected: $($allShipsData.Count)."

if ($allShipsData.Count -gt 0) {
    # Transform array to hashtable keyed by scIdentifier
    Write-Host "Transforming fetched array into an object keyed by scIdentifier..."
    $shipsByIdentifier = @{}
    $skippedShipsList = [System.Collections.Generic.List[PSObject]]::new() # New list for skipped ships
    $skippedCount = 0
    $processedForTransformation = 0
    foreach ($ship in $allShipsData) {
        $processedForTransformation++
        if ($null -ne $ship.scIdentifier -and $ship.scIdentifier.ToString().Trim() -ne "") {
            $currentIdentifier = $ship.scIdentifier.ToString().Trim() # Ensure it's a string and trimmed
            $lowerIdentifier = $currentIdentifier.ToLower()

            if ($shipsByIdentifier.ContainsKey($lowerIdentifier)) {
                Write-Warning "Duplicate scIdentifier found (original: '$($currentIdentifier)', used as: '$($lowerIdentifier)'). Overwriting previous entry for ship named '$($ship.name)' (or ID '$($ship.id)') with new ship data."
            }
            $shipsByIdentifier[$lowerIdentifier] = $ship
        } else {
            $shipNameForLog = "UNKNOWN"
            if ($null -ne $ship.name -and $ship.name.ToString().Trim() -ne "") {
                $shipNameForLog = $ship.name
            } elseif ($null -ne $ship.id -and $ship.id.ToString().Trim() -ne "") {
                $shipNameForLog = "ID: $($ship.id)"
            }

            $skippedCount++ # Count all initially missing scIdentifier

            if ($null -ne $ship.productionStatus -and $ship.productionStatus -eq "flight-ready") {
                $guessedKeyBase = $null
                $guessedKeySource = "unknown" # To log how the key was derived

                # Attempt 1: {manufacturer_abr}_{slug} based on user feedback
                $manufacturerAbr = $null
                if ($null -ne $ship.manufacturer) {
                    if ($ship.manufacturer -is [psobject] -and ($null -ne $ship.manufacturer.code) -and ($ship.manufacturer.code.ToString().Trim() -ne '')) {
                        $manufacturerAbr = $ship.manufacturer.code.ToString().Trim().ToLowerInvariant()
                    } elseif ($ship.manufacturer -is [psobject] -and ($null -ne $ship.manufacturer.name) -and ($ship.manufacturer.name.ToString().Trim() -ne '')) {
                        $manName = $ship.manufacturer.name.ToString().Trim()
                        if ($manName.Contains(" ")) {
                            $manufacturerAbr = ($manName.Split(" ")[0]).ToLowerInvariant() # First word
                        } else {
                            # Use first 4 chars for single word, or full word if shorter
                            $manufacturerAbr = ($manName.Substring(0, [System.Math]::Min($manName.Length, 4))).ToLowerInvariant()
                        }
                    } elseif (($ship.manufacturer -is [string]) -and ($ship.manufacturer.ToString().Trim() -ne '')) {
                         $manName = $ship.manufacturer.ToString().Trim()
                         if ($manName.Contains(" ")) {
                            $manufacturerAbr = ($manName.Split(" ")[0]).ToLowerInvariant()
                        } else {
                            $manufacturerAbr = ($manName.Substring(0, [System.Math]::Min($manName.Length, 4))).ToLowerInvariant()
                        }
                    }
                }

                if (($null -ne $manufacturerAbr) -and ($manufacturerAbr -ne '') -and ($null -ne $ship.slug) -and ($ship.slug.ToString().Trim() -ne '')) {
                    $currentSlug = $ship.slug.ToString().Trim().ToLowerInvariant()
                    $guessedKeyBase = "$($manufacturerAbr)_$($currentSlug)"
                    $guessedKeySource = "manufacturer_slug"
                }

                # Attempt 2: slug (if not used above or failed)
                if (($null -eq $guessedKeyBase -or $guessedKeyBase -eq "") -and ($null -ne $ship.slug) -and ($ship.slug.ToString().Trim() -ne '')) {
                    $guessedKeyBase = $ship.slug.ToString().Trim().ToLowerInvariant()
                    $guessedKeySource = "slug"
                }
                
                # Attempt 3: name (if not used above or failed)
                if (($null -eq $guessedKeyBase -or $guessedKeyBase -eq "") -and ($null -ne $ship.name) -and ($ship.name.ToString().Trim() -ne '')) {
                    $guessedKeyBase = $ship.name.ToString().Trim().ToLowerInvariant() -replace '\s+', '_' -replace '[^a-z0-9_]', ''
                    if ($guessedKeyBase -eq "") { $guessedKeyBase = $null } # Ensure it's not an empty string after replacements
                    if ($null -ne $guessedKeyBase) { $guessedKeySource = "name" }
                }
                
                # Attempt 4: id (if not used above or failed)
                if (($null -eq $guessedKeyBase -or $guessedKeyBase -eq "") -and ($null -ne $ship.id) -and ($ship.id.ToString().Trim() -ne '')) {
                    $guessedKeyBase = $ship.id.ToString().Trim().ToLowerInvariant()
                    $guessedKeySource = "id"
                }

                # Convert hyphens to underscores in the final guessedKeyBase before use
                if ($null -ne $guessedKeyBase) {
                    $guessedKeyBase = $guessedKeyBase -replace '-', '_'
                }

                if ($null -ne $guessedKeyBase -and $guessedKeyBase -ne "") {
                    $fullGuessedKey = $guessedKeyBase
                    $originalGuessedKeyForLog = $fullGuessedKey
                    $collisionCounter = 1
                    while ($shipsByIdentifier.ContainsKey($fullGuessedKey)) {
                        $fullGuessedKey = "$($guessedKeyBase)_$($collisionCounter)"
                        $collisionCounter++
                    }
                    $shipsByIdentifier[$fullGuessedKey] = $ship
                    Write-Host "Ship '$($shipNameForLog)' (flight-ready, missing scIdentifier) added to main list with guessed key '$($fullGuessedKey)' (derived from: $($guessedKeySource)). Original guess: '$($originalGuessedKeyForLog)'."
                } else {
                    Write-Warning "Ship '$($shipNameForLog)' (flight-ready, missing scIdentifier) could not have a key generated (tried manufacturer_slug, slug, name, id). Adding to skipped list."
                    $skippedShipsList.Add($ship) # Add to skipped list only if key generation failed
                }
            } else {
                Write-Host "Ship '$($shipNameForLog)' at index $($processedForTransformation - 1) is missing scIdentifier and is NOT flight-ready (Status: $($ship.productionStatus)). Skipping for all lists."
            }
        }
    }
    Write-Host "Transformation complete. $($shipsByIdentifier.Count) ships mapped by scIdentifier (including guessed keys). $skippedCount ships initially had missing/empty scIdentifier."

    # Convert the PowerShell HASHTABLE to a JSON string
    # Depth 10 should be sufficient for nested objects; increase if needed
    $jsonContent = $shipsByIdentifier | ConvertTo-Json -Depth 10

    # Create the TypeScript file content
    $tsFileContent = @"
// This file is auto-generated by a script. Do not edit manually.
// Data scraped from $($BaseUrl)

export interface FleetyardShip {
    // Define a basic interface based on observed fields in your sample data
    // You should expand this based on the actual structure and your needs
    id: string;
    scIdentifier: string; // This should ideally always be present if used as a key
    name: string;
    slug: string;
    availability?: any; // Consider defining this further
    beam?: number;
    beamLabel?: string;
    cargo?: number | null;
    cargoLabel?: string;
    createdAt?: string;
    updatedAt?: string;
    // Add other common fields you expect to use
    [key: string]: any; // Allows for other properties not explicitly defined
}

export const allFleetyardsShips: { [scIdentifier: string]: FleetyardShip } = $($jsonContent);
"@

    try {
        Set-Content -Path $OutputFilePath -Value $tsFileContent -Encoding UTF8 -ErrorAction Stop
        Write-Host "Successfully wrote $($allShipsData.Count) ships to $($OutputFilePath)"
    }
    catch {
        Write-Error "Failed to write TypeScript file: $($_.Exception.Message)"
    }

    # Handle skipped ships file creation
    if ($skippedShipsList.Count -gt 0) {
        Write-Host "Writing $($skippedShipsList.Count) skipped ships (flight-ready, missing scIdentifier, AND unkeyable by any method) to $($SkippedOutputFilePath)..."
        $skippedJsonContent = $skippedShipsList | ConvertTo-Json -Depth 10
        $skippedTsFileContent = @"
// This file is auto-generated by a script. Do not edit manually.
// Contains ships that were skipped during the main import due to missing scIdentifier.
// Data scraped from $($BaseUrl)

export interface FleetyardShip {
    // Define a basic interface based on observed fields in your sample data
    // You should expand this based on the actual structure and your needs
    id: string;
    scIdentifier?: string | null; // Explicitly mark as optional or null
    name: string;
    slug: string;
    availability?: any;
    beam?: number;
    beamLabel?: string;
    cargo?: number | null;
    cargoLabel?: string;
    createdAt?: string;
    updatedAt?: string;
    productionStatus?: string;
    [key: string]: any;
}

export const skippedFleetyardsShips: FleetyardShip[] = $($skippedJsonContent);
"@
        try {
            Set-Content -Path $SkippedOutputFilePath -Value $skippedTsFileContent -Encoding UTF8 -ErrorAction Stop
            Write-Host "Successfully wrote $($skippedShipsList.Count) skipped ships to $($SkippedOutputFilePath)"
        }
        catch {
            Write-Error "Failed to write skipped ships TypeScript file: $($_.Exception.Message)"
        }
    } else {
        Write-Host "No ships were added to the skipped list (flight-ready, missing scIdentifier, AND unkeyable by any method). '$($SkippedOutputFilePath)' will be empty or not created."
        # Optionally create an empty file or ensure it's empty
        $emptySkippedTsFileContent = @"
// No ships were flight-ready, missing scIdentifier, and also unkeyable by any method.

export interface FleetyardShip {
    id: string;
    scIdentifier?: string | null;
    name: string;
    slug: string;
    productionStatus?: string;
    [key: string]: any;
}

export const skippedFleetyardsShips: FleetyardShip[] = [];
"@
        try {
            Set-Content -Path $SkippedOutputFilePath -Value $emptySkippedTsFileContent -Encoding UTF8 -ErrorAction Stop
            Write-Host "Wrote an empty array to $($SkippedOutputFilePath)"
        }
        catch {
            Write-Error "Failed to write empty skipped ships TypeScript file: $($_.Exception.Message)"
        }
    }
} else {
    Write-Warning "No data was fetched. The TypeScript file will not be created or will be empty."
    # Optionally create an empty file
    $emptyTsFileContent = @"
// No data fetched from the API.

export interface FleetyardShip {
    id: string;
    scIdentifier: string;
    name: string;
    slug: string;
    [key: string]: any;
}

export const allFleetyardsShips: { [scIdentifier: string]: FleetyardShip } = {};
"@
    try {
        Set-Content -Path $OutputFilePath -Value $emptyTsFileContent -Encoding UTF8 -ErrorAction Stop
        Write-Host "Wrote an empty object to $($OutputFilePath)"
    }
    catch {
        Write-Error "Failed to write empty TypeScript file: $($_.Exception.Message)"
    }
}

Write-Host "Script finished." 