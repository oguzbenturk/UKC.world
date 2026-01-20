# Install SSH Key on Server
$pubKey = Get-Content "$env:USERPROFILE\.ssh\id_rsa.pub" -Raw

Write-Host "Installing SSH public key to server..."
Write-Host "You'll need to enter the password ONE LAST TIME"
Write-Host ""

ssh root@217.154.201.29 @"
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo '$pubKey' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo 'SSH key installed successfully!'
"@
