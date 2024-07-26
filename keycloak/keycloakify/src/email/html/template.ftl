<#macro emailLayout>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email from Pathoplexus</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 0;
            margin: 0;
            line-height: 1.6;
            color: #333;
        }
        .container {
            background-color: #f4f4f4;
            padding: 20px;
        }
        .header, .footer {
            text-align: center;
            padding: 10px;
            background-color: #ffffff;
            color: #333;
        }
        .footer {
            font-size: 0.8em;
            color: #666;
            border-top: 1px solid #ddd;
        }
        .logo {
            width: 100px; /* Adjusted the size to better fit the favicon size */
        }
        .content {
            background-color: #ffffff;
            padding: 20px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="https://demo.pathoplexus.org/favicon.svg" alt="Pathoplexus Logo" class="logo">
        </div>
        <div class="content">
            <#nested>
        </div>
        <div class="footer">
            Pathoplexus Association, Basel, Switzerland<br>
            For support, contact us at: <a href="mailto:support@pathoplexus.org">support@pathoplexus.org</a><br>
            Visit our website: <a href="https://pathoplexus.org">pathoplexus.org</a>
        </div>
    </div>
</body>
</html>
</#macro>